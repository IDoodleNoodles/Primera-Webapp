import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore'
import { buildAdminOverview } from './adminOverview.js'
import { hasAdminRole } from './adminGuard.js'
export {
  fetchAdminDashboard,
  fetchPatientAccounts,
  updatePatientAccount,
  setPatientAccountStatus,
  resetPatientPassword,
  fetchAuditLogs,
  recordAuditExport,
  recordAdminLogin,
  recordAdminLogout,
  recordAuthFailure,
  projectPatientAccount,
} from './adminPortal.js'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()
const allowedRoles = new Set(['admin'])

function readName(data: Record<string, unknown>, fallback: string) {
  if (typeof data.name === 'string' && data.name.trim()) return data.name.trim()
  const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : ''
  const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : ''
  return [firstName, lastName].filter(Boolean).join(' ') || fallback
}

async function requireAdmin(request: { auth?: { uid?: string; token?: Record<string, unknown> } }) {
  if (!hasAdminRole(request)) {
    await db.collection('auditLogs').add({
      actorId: request.auth?.uid ?? null,
      action: 'Unauthorized admin action',
      targetId: 'legacy-admin-callable',
      targetType: 'system',
      result: 'unauthorized',
      timestamp: FieldValue.serverTimestamp(),
    })
    throw new HttpsError('permission-denied', 'Only administrators can manage portal accounts.')
  }
  const [authUser, profileSnapshot] = await Promise.all([
    auth.getUser(request.auth?.uid as string),
    db.collection('users').where(FieldPath.documentId(), '==', request.auth?.uid as string).select('active', 'status').limit(1).get(),
  ])
  const profile = profileSnapshot.docs[0]?.data()
  if (authUser.disabled || profile?.active === false || profile?.status === 'disabled') {
    await db.collection('auditLogs').add({
      actorId: request.auth?.uid ?? null,
      action: 'Rejected disabled admin action',
      targetId: 'legacy-admin-callable',
      targetType: 'system',
      result: 'unauthorized',
      timestamp: FieldValue.serverTimestamp(),
    })
    throw new HttpsError('permission-denied', 'This administrator account is disabled.')
  }
}

function requireStaff(request: { auth?: { token?: Record<string, unknown> } }) {
  const role = request.auth?.token?.role
  if (role !== 'admin' && role !== 'doctor') {
    throw new HttpsError('permission-denied', 'Only staff can write audit logs.')
  }
}

async function writeAdminAudit(request: { auth?: { uid?: string; token?: Record<string, unknown> } }, action: string, targetId: string, targetType: 'patient' | 'doctor' | 'assignment' | 'system') {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.')
  await db.collection('auditLogs').add({
    actorId: request.auth.uid,
    actorRole: request.auth.token?.role ?? null,
    action,
    targetId,
    targetType,
    timestamp: FieldValue.serverTimestamp(),
  })
}

function pageSize(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, 1), 100) : 50
}

export const createStaffAccount = onCall({ enforceAppCheck: true }, async (request) => {
  await requireAdmin(request)

  const data = request.data as { email?: string; password?: string; name?: string; role?: string }
  if (!data.email || !data.password || !data.name || !data.role || !allowedRoles.has(data.role)) {
    throw new HttpsError('invalid-argument', 'email, password, name, and a valid role are required.')
  }

  let createdUid: string | undefined
  try {
    const user = await auth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
    })
    createdUid = user.uid

    await auth.setCustomUserClaims(user.uid, { role: data.role })
    await db.doc(`users/${user.uid}`).set({
      name: data.name,
      email: data.email,
      role: data.role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (data.role === 'doctor') {
      await db.doc(`doctors/${user.uid}`).set({
        name: data.name,
        email: data.email,
        specialty: 'OBGYN',
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      })
    } else {
      await db.doc(`admins/${user.uid}`).set({
        name: data.name,
        email: data.email,
        active: true,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    await writeAdminAudit(request, 'Created staff account', user.uid, data.role === 'doctor' ? 'doctor' : 'system')
    return { uid: user.uid }
  } catch (error) {
    if (createdUid) {
      await auth.deleteUser(createdUid).catch(() => undefined)
      await Promise.all([
        db.doc(`users/${createdUid}`).delete().catch(() => undefined),
        db.doc(`doctors/${createdUid}`).delete().catch(() => undefined),
        db.doc(`admins/${createdUid}`).delete().catch(() => undefined),
      ])
    }
    const code = error instanceof Error && error.message.includes('already')
      ? 'already-exists'
      : 'internal'
    throw new HttpsError(code, 'Unable to create the staff account.')
  }
})

export const fetchAdminStaffDirectory = onCall({ enforceAppCheck: true }, async (request) => {
  await requireAdmin(request)

  const data = request.data as { search?: string; pageSize?: number; pageToken?: string }
  const search = typeof data.search === 'string' ? data.search.trim() : ''
  const snapshot = await db.collection('users')
    .where('role', 'in', ['doctor', 'admin'])
    .limit(pageSize(data.pageSize))
    .get()
  const normalizedSearch = search.toLocaleLowerCase()
  const items = snapshot.docs
    .map((entry) => ({
      uid: entry.id,
      name: readName(entry.data(), 'Unnamed staff member'),
      email: typeof entry.data().email === 'string' ? entry.data().email : '',
      role: entry.data().role as 'admin' | 'doctor',
      active: entry.data().active !== false,
      specialty: typeof entry.data().specialty === 'string' ? entry.data().specialty : undefined,
    }))
    .filter((entry) => !normalizedSearch || entry.name.toLocaleLowerCase().includes(normalizedSearch))
    .sort((left, right) => left.name.localeCompare(right.name))
  return { items, nextPageToken: null }
})

export const fetchAdminOverview = onCall({ enforceAppCheck: true }, async (request) => {
  await requireAdmin(request)
  return buildAdminOverview(db)
})

export const setStaffAccountStatus = onCall({ enforceAppCheck: true }, async (request) => {
  await requireAdmin(request)

  const data = request.data as { uid?: string; active?: boolean }
  if (!data.uid || typeof data.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'uid and active status are required.')
  }
  if (data.uid === request.auth?.uid) {
    throw new HttpsError('failed-precondition', 'You cannot change your own account status.')
  }

  const staffProfile = await db.doc(`users/${data.uid}`).get()
  await auth.updateUser(data.uid, { disabled: !data.active })
  await db.doc(`users/${data.uid}`).set({ active: data.active }, { merge: true })
  await db.doc(`doctors/${data.uid}`).set({ active: data.active }, { merge: true })
  await db.doc(`admins/${data.uid}`).set({ active: data.active }, { merge: true })

  await writeAdminAudit(
    request,
    `${data.active ? 'Enabled' : 'Disabled'} staff account`,
    data.uid,
    staffProfile.data()?.role === 'doctor' ? 'doctor' : 'system',
  )
  return { uid: data.uid, active: data.active }
})

export const updateStaffAccount = onCall({ enforceAppCheck: true }, async (request) => {
  await requireAdmin(request)

  const data = request.data as { uid?: string; name?: string; role?: string }
  if (!data.uid || !data.name || !data.role || !allowedRoles.has(data.role)) {
    throw new HttpsError('invalid-argument', 'uid, name, and a valid role are required.')
  }
  if (data.uid === request.auth?.uid) {
    throw new HttpsError('failed-precondition', 'You cannot change your own account role.')
  }

  const user = await auth.updateUser(data.uid, { displayName: data.name })
  await auth.setCustomUserClaims(data.uid, { role: data.role })
  const previousProfile = await db.doc(`users/${data.uid}`).get()
  const previousRole = previousProfile.data()?.role
  if (previousRole === 'doctor' && data.role === 'admin') {
    const [assignments, assignedPatients, assignedUsers] = await Promise.all([
      db.collection('assignments').where('doctorId', '==', data.uid).limit(1).get(),
      db.collection(`doctors/${data.uid}/assignedPatients`).limit(1).get(),
      db.collection('users').where('assignedDoctorId', '==', data.uid).limit(1).get(),
    ])
    if (!assignments.empty || !assignedPatients.empty || !assignedUsers.empty) {
      throw new HttpsError('failed-precondition', 'This doctor still has patient assignments. The patient-led flow must resolve them first.')
    }
  }
  await db.doc(`users/${data.uid}`).set({ name: data.name, role: data.role }, { merge: true })
  if (previousRole === 'doctor' && data.role === 'admin') await db.doc(`doctors/${data.uid}`).delete()
  if (previousRole === 'admin' && data.role === 'doctor') await db.doc(`admins/${data.uid}`).delete()
  await db.doc(`${data.role === 'doctor' ? 'doctors' : 'admins'}/${data.uid}`).set({ name: data.name }, { merge: true })

  await writeAdminAudit(request, 'Updated staff account', data.uid, data.role === 'doctor' ? 'doctor' : 'system')
  return { uid: user.uid }
})

export const deleteStaffAccount = onCall({ enforceAppCheck: true }, async (request) => {
  await requireAdmin(request)

  const data = request.data as { uid?: string }
  if (!data.uid) throw new HttpsError('invalid-argument', 'uid is required.')
  if (data.uid === request.auth?.uid) throw new HttpsError('failed-precondition', 'You cannot delete your own account.')

  const [staffProfile, assignments, assignedPatients, assignedUsers] = await Promise.all([
    db.doc(`users/${data.uid}`).get(),
    db.collection('assignments').where('doctorId', '==', data.uid).get(),
    db.collection(`doctors/${data.uid}/assignedPatients`).get(),
    db.collection('users').where('assignedDoctorId', '==', data.uid).get(),
  ])
  if (staffProfile.data()?.role === 'doctor' && (assignments.size > 0 || assignedPatients.size > 0 || assignedUsers.size > 0)) {
    throw new HttpsError('failed-precondition', 'This doctor still has patient assignments. The patient-led flow must resolve them first.')
  }

  await auth.deleteUser(data.uid)
  await Promise.all([
    db.doc(`users/${data.uid}`).delete(),
    db.doc(`doctors/${data.uid}`).delete(),
    db.doc(`admins/${data.uid}`).delete(),
  ])

  await writeAdminAudit(request, 'Deleted staff account', data.uid, staffProfile.data()?.role === 'doctor' ? 'doctor' : 'system')
  return { uid: data.uid }
})

export const respondToDoctorLinkRequest = onCall(async (request) => {
  if (request.auth?.token?.role !== 'doctor') {
    throw new HttpsError('permission-denied', 'Only participating doctors can respond to link requests.')
  }

  const data = request.data as { requestId?: string; decision?: string }
  if (!data.requestId || (data.decision !== 'accept' && data.decision !== 'decline')) {
    throw new HttpsError('invalid-argument', 'requestId and an accept or decline decision are required.')
  }

  const requestRef = db.doc(`doctorLinkRequests/${data.requestId}`)
  const requestSnapshot = await requestRef.get()
  const linkRequest = requestSnapshot.data()
  if (!requestSnapshot.exists || linkRequest?.doctorId !== request.auth.uid || linkRequest.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This link request is no longer available.')
  }

  if (data.decision === 'decline') {
    await requestRef.update({ status: 'declined', respondedAt: FieldValue.serverTimestamp() })
    return { success: true }
  }

  const patientId = linkRequest.patientId
  if (typeof patientId !== 'string') throw new HttpsError('invalid-argument', 'The link request has no patient.')
  const batch = db.batch()
  const previousAssignments = await db.collection('assignments').where('patientId', '==', patientId).get()
  previousAssignments.docs.forEach((entry) => {
    const previousDoctorId = entry.data().doctorId
    batch.delete(entry.ref)
    if (typeof previousDoctorId === 'string') {
      batch.delete(db.doc(`doctors/${previousDoctorId}/assignedPatients/${patientId}`))
    }
  })

  batch.update(db.doc(`users/${patientId}`), { assignedDoctorId: request.auth.uid, updatedAt: FieldValue.serverTimestamp() })
  batch.set(db.doc(`assignments/${request.auth.uid}_${patientId}`), {
    patientId,
    doctorId: request.auth.uid,
    source: 'patient-request',
    assignedAt: FieldValue.serverTimestamp(),
  })

  batch.set(db.doc(`doctors/${request.auth.uid}/assignedPatients/${patientId}`), {
    patientId,
    source: 'patient-request',
    assignedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  batch.update(requestRef, { status: 'accepted', respondedAt: FieldValue.serverTimestamp() })
  await batch.commit()
  return { success: true }
})

export const resetStaffPassword = onCall({ enforceAppCheck: true }, async (request) => {
  await requireAdmin(request)

  const data = request.data as { uid?: string }
  if (!data.uid) throw new HttpsError('invalid-argument', 'uid is required.')

  const user = await auth.getUser(data.uid)
  const profile = await db.doc(`users/${data.uid}`).get()
  if (!allowedRoles.has(profile.data()?.role)) {
    throw new HttpsError('failed-precondition', 'Password reset is only available for staff accounts.')
  }
  if (!user.email) throw new HttpsError('failed-precondition', 'This staff account has no email address for password recovery.')

  const resetLink = await auth.generatePasswordResetLink(user.email)
  await writeAdminAudit(request, 'Issued staff password reset', data.uid, 'system')
  const [local, domain] = user.email.split('@')
  const maskedEmail = `${local.slice(0, 1)}***@${domain}`
  return { success: true, maskedEmail, resetLink }
})

export const writeAuditLog = onCall(async (request) => {
  requireStaff(request)
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const data = request.data as { action?: string; targetId?: string; targetType?: string }
  const targetTypes = new Set(['patient', 'doctor', 'assignment', 'system'])
  if (!data.action || data.action.length > 120 || !data.targetId || data.targetId.length > 200 || !data.targetType || !targetTypes.has(data.targetType)) {
    throw new HttpsError('invalid-argument', 'action, targetId, and targetType are required.')
  }
  if (request.auth.token.role === 'admin' && (data.targetType === 'patient' || data.targetType === 'assignment')) {
    throw new HttpsError('permission-denied', 'Administrators cannot create patient-linked audit events.')
  }

  await db.collection('auditLogs').add({
    actorId: request.auth.uid,
    actorRole: request.auth.token.role ?? null,
    action: data.action,
    targetId: data.targetId,
    targetType: data.targetType,
    timestamp: FieldValue.serverTimestamp(),
  })

  return { success: true }
})
