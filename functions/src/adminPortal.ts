import { createHash } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldPath, FieldValue, getFirestore, type DocumentData } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()
const callableOptions = { enforceAppCheck: true, cors: true } as const
const projectionFields = ['name', 'username', 'email', 'status', 'registrationDate', 'lastActive'] as const
const editableFields = new Set(['name', 'username', 'status'])

type AdminRequest = CallableRequest<Record<string, unknown>>
type Projection = {
  name: string
  username: string
  email: string
  status: string
  registrationDate: string
  lastActive: string
}

function iso(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return typeof value === 'string' ? value : ''
}

export function projectPatientAccount(data: DocumentData): Projection {
  return {
    name: typeof data.name === 'string' ? data.name : '',
    username: typeof data.username === 'string' ? data.username : '',
    email: typeof data.email === 'string' ? data.email : '',
    status: typeof data.status === 'string' ? data.status : data.active === false ? 'disabled' : 'active',
    registrationDate: iso(data.registrationDate ?? data.createdAt),
    lastActive: iso(data.lastActive ?? data.lastActiveAt ?? data.lastLoginAt),
  }
}

function actorName(request: AdminRequest) {
  return typeof request.auth?.token?.name === 'string' && request.auth.token.name
    ? request.auth.token.name
    : request.auth?.token?.email ?? request.auth?.uid ?? 'Anonymous'
}

async function writeAudit(
  request: AdminRequest,
  action: string,
  target: string,
  result: 'success' | 'failure' | 'unauthorized',
  details: Record<string, unknown> = {},
) {
  await db.collection('auditLogs').add({
    actorId: request.auth?.uid ?? null,
    actorName: actorName(request),
    action,
    target,
    result,
    details,
    timestamp: FieldValue.serverTimestamp(),
  })
}

async function requireAdmin(request: AdminRequest) {
  if (!request.auth?.uid || request.auth.token.role !== 'admin') {
    await writeAudit(request, 'Unauthorized admin action', 'admin-portal', 'unauthorized')
    throw new HttpsError('permission-denied', 'Only administrators can access this operation.')
  }

  const [authUser, profileSnapshot] = await Promise.all([
    auth.getUser(request.auth.uid),
    db.collection('users').where(FieldPath.documentId(), '==', request.auth.uid).select('active', 'status').limit(1).get(),
  ])
  const profile = profileSnapshot.docs[0]?.data()
  const active = profile?.active !== false && profile?.status !== 'disabled'
  if (authUser.disabled || !active) {
    await writeAudit(request, 'Rejected disabled admin action', 'admin-portal', 'unauthorized')
    throw new HttpsError('permission-denied', 'This administrator account is disabled.')
  }
}

function dataObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'A valid request object is required.')
  }
  return value as Record<string, unknown>
}

async function invalid(request: AdminRequest, action: string, target: string, message: string): Promise<never> {
  await writeAudit(request, action, target, 'failure', { reason: 'invalid-argument' })
  throw new HttpsError('invalid-argument', message)
}

function pageSize(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, 1), 100) : 100
}

function auditLogFromData(id: string, value: DocumentData) {
  return {
    id,
    actorId: typeof value.actorId === 'string' ? value.actorId : null,
    actorName: typeof value.actorName === 'string' ? value.actorName : 'Unknown',
    action: typeof value.action === 'string' ? value.action : 'Unknown action',
    target: typeof value.target === 'string' ? value.target : 'Unknown target',
    timestamp: iso(value.timestamp),
    result: typeof value.result === 'string' ? value.result : 'unknown',
  }
}

async function patientProjection(uid: string): Promise<Projection> {
  const snapshot = await db.collection('users')
    .where(FieldPath.documentId(), '==', uid)
    .select(...projectionFields, 'active', 'createdAt', 'lastActiveAt', 'lastLoginAt', 'role')
    .limit(1)
    .get()
  if (snapshot.empty || snapshot.docs[0].data().role !== 'patient') throw new HttpsError('not-found', 'Patient account not found.')
  return projectPatientAccount(snapshot.docs[0].data())
}

export const recordAdminLogin = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  await writeAudit(request, 'Login', 'admin-portal', 'success')
  return { success: true }
})

export const recordAdminLogout = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  await writeAudit(request, 'Logout', 'admin-portal', 'success')
  return { success: true }
})

export const recordAuthFailure = onCall(callableOptions, async (request) => {
  const ip = (request.rawRequest as { ip?: string } | undefined)?.ip ?? 'unknown'
  const bucket = Math.floor(Date.now() / 60_000)
  const ipHash = createHash('sha256').update(ip).digest('hex')
  const bucketRef = db.doc(`authFailureBuckets/${ipHash}-${bucket}`)
  const shouldAudit = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(bucketRef)
    const count = (snapshot.data()?.count as number | undefined ?? 0) + 1
    transaction.set(bucketRef, { count, ipHash, bucket, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return count === 1
  })
  if (shouldAudit) await writeAudit(request, 'Authentication failure bucket', `auth-failure-${bucket}`, 'failure', { bucket, count: 1 })
  return { accepted: true }
})

export const fetchAdminDashboard = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  try {
    const snapshot = await db.collection('users').where('role', '==', 'patient').select('status', 'active').limit(1000).get()
    const accounts = snapshot.docs.map((entry) => projectPatientAccount(entry.data()))
    const logs = await db.collection('auditLogs').orderBy('timestamp', 'desc').limit(10).get()
    const recentAuditLogs = logs.docs.map((entry) => auditLogFromData(entry.id, entry.data()))
    await writeAudit(request, 'View dashboard', 'admin-dashboard', 'success')
    return {
      totalPatientAccounts: accounts.length,
      activePatientAccounts: accounts.filter((account) => account.status !== 'disabled').length,
      disabledPatientAccounts: accounts.filter((account) => account.status === 'disabled').length,
      recentAuditLogs,
    }
  } catch (error) {
    await writeAudit(request, 'View dashboard', 'admin-dashboard', 'failure')
    throw error
  }
})

export const fetchPatientAccounts = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  const data = dataObject(request.data)
  const search = typeof data.search === 'string' ? data.search.trim().toLocaleLowerCase() : ''
  try {
    const snapshot = await db.collection('users')
      .where('role', '==', 'patient')
      .select(...projectionFields, 'active', 'createdAt', 'lastActiveAt', 'lastLoginAt')
      .limit(pageSize(data.pageSize))
      .get()
    const accounts: Record<string, Projection> = {}
    snapshot.docs.forEach((entry) => {
      const account = projectPatientAccount(entry.data())
      const haystack = `${account.name} ${account.username} ${account.email}`.toLocaleLowerCase()
      if (!search || haystack.includes(search)) accounts[entry.id] = account
    })
    await writeAudit(request, 'View patient accounts', 'patient-accounts', 'success', { filtered: Boolean(search), rowCount: Object.keys(accounts).length })
    return { accounts, nextPageToken: null }
  } catch (error) {
    await writeAudit(request, 'View patient accounts', 'patient-accounts', 'failure', { filtered: Boolean(search) })
    throw error
  }
})

export const updatePatientAccount = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  const data = dataObject(request.data)
  const uid = typeof data.uid === 'string' ? data.uid : ''
  const fields = dataObject(data.fields)
  if (!uid || Object.keys(fields).some((key) => !editableFields.has(key))) {
    return invalid(request, 'Edit patient account', uid || 'unknown', 'Only name, username, and status may be edited.')
  }
  const before = await patientProjection(uid)
  const updates: Record<string, string> = {}
  const changed: Record<string, { old: string; new: string }> = {}
  for (const key of Object.keys(fields)) {
    if (typeof fields[key] !== 'string' || !fields[key].trim()) return invalid(request, 'Edit patient account', uid, `${key} must be a non-empty string.`)
    const value = fields[key].trim()
    if (value !== before[key as keyof Projection]) {
      updates[key] = value
      changed[key] = { old: before[key as keyof Projection], new: value }
    }
  }
  try {
    if (Object.keys(updates).length) {
      if (updates.status) {
        await auth.updateUser(uid, { disabled: updates.status === 'disabled' })
        await auth.revokeRefreshTokens(uid)
        updates.active = updates.status === 'disabled' ? 'false' : 'true'
      }
      await db.doc(`users/${uid}`).update({
        ...updates,
        ...(updates.active ? { active: updates.active === 'true' } : {}),
      })
      delete updates.active
    }
    const account = await patientProjection(uid)
    await writeAudit(request, 'Edit patient account', uid, 'success', { changed })
    return { account: { uid, ...account } }
  } catch (error) {
    await writeAudit(request, 'Edit patient account', uid, 'failure')
    throw error
  }
})

export const setPatientAccountStatus = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  const data = dataObject(request.data)
  const uid = typeof data.uid === 'string' ? data.uid : ''
  const status = typeof data.status === 'string' ? data.status.trim() : ''
  if (!uid || !status) return invalid(request, 'Change patient account status', uid || 'unknown', 'uid and status are required.')
  try {
    const before = await patientProjection(uid)
    await auth.updateUser(uid, { disabled: status === 'disabled' })
    await auth.revokeRefreshTokens(uid)
    await db.doc(`users/${uid}`).update({ status, active: status !== 'disabled' })
    const account = await patientProjection(uid)
    await writeAudit(request, 'Change patient account status', uid, 'success', { changed: { status: { old: before.status, new: status } } })
    return { account: { uid, ...account } }
  } catch (error) {
    await writeAudit(request, 'Change patient account status', uid, 'failure')
    throw error
  }
})

export const resetPatientPassword = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  const data = dataObject(request.data)
  const uid = typeof data.uid === 'string' ? data.uid : ''
  if (!uid) return invalid(request, 'Reset patient password', 'unknown', 'uid is required.')
  try {
    const profile = await patientProjection(uid)
    const user = await auth.getUser(uid)
    if (!user.email) throw new HttpsError('failed-precondition', 'This account has no recovery email.')
    await auth.generatePasswordResetLink(user.email)
    await writeAudit(request, 'Reset patient password', uid, 'success')
    return { success: true, account: { name: profile.name } }
  } catch (error) {
    await writeAudit(request, 'Reset patient password', uid, 'failure')
    throw error
  }
})

export const fetchAuditLogs = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  const data = dataObject(request.data)
  const filter = typeof data.filter === 'string' ? data.filter.trim().toLocaleLowerCase() : ''
  try {
    const snapshot = await db.collection('auditLogs').orderBy('timestamp', 'desc').limit(200).get()
    const logs = snapshot.docs.map((entry) => auditLogFromData(entry.id, entry.data()))
      .filter((log) => !filter || `${log.action} ${log.target} ${log.actorName}`.toLocaleLowerCase().includes(filter))
    await writeAudit(request, 'View audit log', 'audit-log', 'success', { filtered: Boolean(filter), rowCount: logs.length })
    return { logs }
  } catch (error) {
    await writeAudit(request, 'View audit log', 'audit-log', 'failure', { filtered: Boolean(filter) })
    throw error
  }
})

export const recordAuditExport = onCall(callableOptions, async (request) => {
  await requireAdmin(request)
  const data = dataObject(request.data)
  const filter = typeof data.filter === 'string' ? data.filter : ''
  const rowCount = typeof data.rowCount === 'number' && Number.isInteger(data.rowCount) ? data.rowCount : -1
  if (filter.length > 200 || rowCount < 0) return invalid(request, 'Export audit log', 'audit-log', 'Invalid export metadata.')
  await writeAudit(request, 'Export audit log', 'audit-log', 'success', { filter, rowCount })
  return { success: true }
})
