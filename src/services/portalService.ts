import {
  collection,
  doc,
  endAt,
  getCountFromServer,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  addDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth, db, firebaseConfigured } from '../firebase'
import type { AuditLog, PatientAccount } from '../types'

export type AdminDashboard = {
  totalPatientAccounts: number
  activePatientAccounts: number
  disabledPatientAccounts: number
  recentAuditLogs: AuditLog[]
}

export type AccountCursor = {
  name: QueryDocumentSnapshot<DocumentData> | null
  email: QueryDocumentSnapshot<DocumentData> | null
}

export type PatientAccountPage = {
  accounts: PatientAccount[]
  nextCursor: AccountCursor | null
}

function requireFirebase() {
  if (!firebaseConfigured || !db || !auth || !auth.currentUser) throw new Error('Firebase is not configured or the session has expired.')
  return { firestore: db, firebaseAuth: auth, currentUser: auth.currentUser }
}

function toDateString(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString()
  return typeof value === 'string' ? value : ''
}

function toAccount(snapshot: QueryDocumentSnapshot<DocumentData>): PatientAccount {
  const data = snapshot.data()
  return {
    uid: snapshot.id,
    name: String(data.name ?? ''),
    username: String(data.username ?? ''),
    email: String(data.email ?? ''),
    status: String(data.status ?? ''),
    createdAt: toDateString(data.createdAt),
    lastActive: toDateString(data.lastActive),
  }
}

function toAuditLog(snapshot: QueryDocumentSnapshot<DocumentData>): AuditLog {
  const data = snapshot.data()
  return {
    id: snapshot.id,
    actorUid: String(data.actorUid ?? ''),
    actorEmail: String(data.actorEmail ?? ''),
    action: String(data.action ?? ''),
    targetId: String(data.targetId ?? ''),
    targetType: String(data.targetType ?? ''),
    timestamp: toDateString(data.timestamp),
    result: String(data.result ?? ''),
    details: String(data.details ?? ''),
  }
}

async function writeAudit(action: string, targetId: string, targetType: string, result: string, details: string) {
  const { firestore, currentUser } = requireFirebase()
  await addDoc(collection(firestore, 'auditLogs'), {
    actorUid: currentUser.uid,
    actorEmail: currentUser.email ?? '',
    action,
    targetId,
    targetType,
    result,
    details,
    timestamp: serverTimestamp(),
  })
}

export async function recordLogin() {
  await writeAudit('login', 'admin-portal', 'portal', 'success', '')
}

export async function recordLogout() {
  await writeAudit('logout', 'admin-portal', 'portal', 'success', '')
}

export async function recordUnauthorizedAccess() {
  await writeAudit('unauthorized_access', 'admin-portal', 'portal', 'denied', '')
}

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  const { firestore } = requireFirebase()
  const [total, active, disabled, recent] = await Promise.all([
    getCountFromServer(collection(firestore, 'accountSummaries')),
    getCountFromServer(query(collection(firestore, 'accountSummaries'), where('status', '==', 'active'))),
    getCountFromServer(query(collection(firestore, 'accountSummaries'), where('status', '==', 'disabled'))),
    getDocs(query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'), limit(10))),
  ])
  return {
    totalPatientAccounts: total.data().count,
    activePatientAccounts: active.data().count,
    disabledPatientAccounts: disabled.data().count,
    recentAuditLogs: recent.docs.map(toAuditLog),
  }
}

export async function fetchPatientAccounts(search = '', cursor: AccountCursor | null = null): Promise<PatientAccountPage> {
  const { firestore } = requireFirebase()
  const normalized = search.trim().toLowerCase()
  const buildQuery = (field: 'nameLower' | 'emailLower', previous: QueryDocumentSnapshot<DocumentData> | null) => {
    const constraints = normalized
      ? [where(field, '>=', normalized), endAt(`${normalized}\uf8ff`)]
      : [orderBy('nameLower')]
    return query(collection(firestore, 'accountSummaries'), ...constraints, ...(previous ? [startAfter(previous)] : []), limit(20))
  }
  const [nameResults, emailResults] = normalized
    ? await Promise.all([getDocs(buildQuery('nameLower', cursor?.name ?? null)), getDocs(buildQuery('emailLower', cursor?.email ?? null))])
    : [await getDocs(buildQuery('nameLower', cursor?.name ?? null)), null]
  const documents = [...nameResults.docs, ...(emailResults?.docs ?? [])]
  const unique = new Map(documents.map((snapshot) => [snapshot.id, snapshot]))
  await writeAudit(normalized ? 'search_view' : 'list_view', normalized || 'account-list', 'accountSummaries', 'success', normalized)
  return {
    accounts: [...unique.values()].slice(0, 20).map(toAccount),
    nextCursor: normalized
      ? { name: nameResults.docs.at(-1) ?? null, email: emailResults?.docs.at(-1) ?? null }
      : { name: nameResults.docs.at(-1) ?? null, email: null },
  }
}

export async function updatePatientAccount(uid: string, fields: { name: string; username: string }) {
  const { firestore } = requireFirebase()
  const before = await getDoc(doc(firestore, 'accountSummaries', uid))
  if (!before.exists()) throw new Error('Account summary not found.')
  const name = fields.name.trim()
  const username = fields.username.trim()
  await updateDoc(doc(firestore, 'accountSummaries', uid), { name, username, nameLower: name.toLowerCase() })
  await writeAudit('edit', uid, 'accountSummary', 'success', JSON.stringify({
    name: { old: before.data().name ?? '', new: name },
    username: { old: before.data().username ?? '', new: username },
  }))
}

export async function setPatientAccountStatus(uid: string, status: 'active' | 'disabled') {
  const { firestore } = requireFirebase()
  const before = await getDoc(doc(firestore, 'accountSummaries', uid))
  if (!before.exists()) throw new Error('Account summary not found.')
  await updateDoc(doc(firestore, 'accountSummaries', uid), { status })
  await writeAudit('status_change', uid, 'accountSummary', 'success', JSON.stringify({
    old: before.data().status ?? '',
    new: status,
  }))
}

export async function resetPatientPassword(uid: string) {
  const { firestore, firebaseAuth } = requireFirebase()
  const summary = await getDoc(doc(firestore, 'accountSummaries', uid))
  if (!summary.exists()) throw new Error('Account summary not found.')
  const email = String(summary.data().email ?? '')
  if (!email) throw new Error('The account has no email address.')
  await sendPasswordResetEmail(firebaseAuth, email)
  await writeAudit('password_reset', uid, 'accountSummary', 'success', '')
}

export async function fetchAuditLogs(filter = ''): Promise<AuditLog[]> {
  const { firestore } = requireFirebase()
  const snapshots = await getDocs(query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'), limit(100)))
  const normalized = filter.trim().toLowerCase()
  const logs = snapshots.docs.map(toAuditLog).filter((log) => !normalized
    || `${log.action} ${log.targetId} ${log.targetType} ${log.result}`.toLowerCase().includes(normalized))
  await writeAudit(normalized ? 'search_view' : 'list_view', normalized || 'audit-list', 'auditLogs', 'success', normalized)
  return logs
}

export async function recordAuditExport(filter: string, rowCount: number) {
  await writeAudit('csv_export', 'auditLogs', 'auditLogs', 'success', JSON.stringify({ filter, rowCount }))
}
