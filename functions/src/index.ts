import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()
const allowedRoles = new Set(['admin', 'doctor'])

type AdminPatient = {
  id: string
  name: string
  assignedDoctorId: string | null
  active: boolean
}

function readName(data: Record<string, unknown>, fallback: string) {
  if (typeof data.name === 'string' && data.name.trim()) return data.name.trim()
  const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : ''
  const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : ''
  return [firstName, lastName].filter(Boolean).join(' ') || fallback
}

function isPatientProfile(data: Record<string, unknown>) {
  return data.role === 'patient' || (data.role !== 'admin' && data.role !== 'doctor')
}

function requireAdmin(request: { auth?: { token?: Record<string, unknown> } }) {
  if (request.auth?.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only administrators can manage portal accounts.')
  }
}

export const createStaffAccount = onCall(async (request) => {
  requireAdmin(request)

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

    return { uid: user.uid }
  } catch (error) {
    if (createdUid) await auth.deleteUser(createdUid).catch(() => undefined)
    const code = error instanceof Error && error.message.includes('already')
      ? 'already-exists'
      : 'internal'
    throw new HttpsError(code, 'Unable to create the staff account.')
  }
})

export const fetchAdminPatientDirectory = onCall(async (request) => {
  requireAdmin(request)

  const snapshot = await db.collection('users').get()
  return snapshot.docs
    .filter((entry) => {
      return isPatientProfile(entry.data())
    })
    .map((entry): AdminPatient => ({
      id: entry.id,
      name: readName(entry.data(), 'Unnamed patient'),
      assignedDoctorId: typeof entry.data().assignedDoctorId === 'string' ? entry.data().assignedDoctorId : null,
      active: entry.data().active !== false,
    }))
})

export const fetchAdminStaffDirectory = onCall(async (request) => {
  requireAdmin(request)

  const snapshot = await db.collection('users').get()
  return snapshot.docs
    .filter((entry) => entry.data().role === 'doctor' || entry.data().role === 'admin')
    .map((entry) => ({
      uid: entry.id,
      name: readName(entry.data(), 'Unnamed staff member'),
      email: typeof entry.data().email === 'string' ? entry.data().email : '',
      role: entry.data().role as 'admin' | 'doctor',
      active: entry.data().active !== false,
      specialty: typeof entry.data().specialty === 'string' ? entry.data().specialty : undefined,
    }))
})

export const setStaffAccountStatus = onCall(async (request) => {
  requireAdmin(request)

  const data = request.data as { uid?: string; active?: boolean }
  if (!data.uid || typeof data.active !== 'boolean') {
    throw new HttpsError('invalid-argument', 'uid and active status are required.')
  }

  await auth.updateUser(data.uid, { disabled: !data.active })
  await db.doc(`users/${data.uid}`).set({ active: data.active }, { merge: true })
  await db.doc(`doctors/${data.uid}`).set({ active: data.active }, { merge: true })
  await db.doc(`admins/${data.uid}`).set({ active: data.active }, { merge: true })

  return { uid: data.uid, active: data.active }
})

export const updateStaffAccount = onCall(async (request) => {
  requireAdmin(request)

  const data = request.data as { uid?: string; name?: string; role?: string }
  if (!data.uid || !data.name || !data.role || !allowedRoles.has(data.role)) {
    throw new HttpsError('invalid-argument', 'uid, name, and a valid role are required.')
  }

  const user = await auth.updateUser(data.uid, { displayName: data.name })
  await auth.setCustomUserClaims(data.uid, { role: data.role })
  const previousProfile = await db.doc(`users/${data.uid}`).get()
  const previousRole = previousProfile.data()?.role
  await db.doc(`users/${data.uid}`).set({ name: data.name, role: data.role }, { merge: true })
  if (previousRole === 'doctor' && data.role === 'admin') await db.doc(`doctors/${data.uid}`).delete()
  if (previousRole === 'admin' && data.role === 'doctor') await db.doc(`admins/${data.uid}`).delete()
  await db.doc(`${data.role === 'doctor' ? 'doctors' : 'admins'}/${data.uid}`).set({ name: data.name }, { merge: true })

  return { uid: user.uid }
})

export const deleteStaffAccount = onCall(async (request) => {
  requireAdmin(request)

  const data = request.data as { uid?: string }
  if (!data.uid) throw new HttpsError('invalid-argument', 'uid is required.')
  if (data.uid === request.auth?.uid) throw new HttpsError('failed-precondition', 'You cannot delete your own account.')

  await auth.deleteUser(data.uid)
  await Promise.all([
    db.doc(`users/${data.uid}`).delete(),
    db.doc(`doctors/${data.uid}`).delete(),
    db.doc(`admins/${data.uid}`).delete(),
  ])

  return { uid: data.uid }
})

export const deletePatientAccount = onCall(async (request) => {
  requireAdmin(request)

  const data = request.data as { patientId?: string }
  if (!data.patientId) throw new HttpsError('invalid-argument', 'patientId is required.')

  const assignments = await db.collection('assignments').where('patientId', '==', data.patientId).get()
  const doctorIds = assignments.docs
    .map((entry) => entry.data().doctorId)
    .filter((doctorId): doctorId is string => typeof doctorId === 'string')
  const dependentCollections = ['alerts', 'activity_logs', 'transcriptions', 'checkins', 'goals']
  const dependentSnapshots = await Promise.all(dependentCollections.map((name) => {
    const field = name === 'alerts' ? 'patientId' : 'userId'
    return db.collection(name).where(field, '==', data.patientId).get()
  }))
  const batch = db.batch()
  batch.delete(db.doc(`users/${data.patientId}`))
  assignments.docs.forEach((entry) => batch.delete(entry.ref))
  doctorIds.forEach((doctorId) => batch.delete(db.doc(`doctors/${doctorId}/assignedPatients/${data.patientId}`)))
  dependentSnapshots.forEach((snapshot) => snapshot.docs.forEach((entry) => batch.delete(entry.ref)))
  const smartwatch = await db.collection(`users/${data.patientId}/smartwatchHealthRecords`).get()
  smartwatch.docs.forEach((entry) => batch.delete(entry.ref))
  await batch.commit()

  return { id: data.patientId }
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

export const resetStaffPassword = onCall(async (request) => {
  requireAdmin(request)

  const data = request.data as { uid?: string }
  if (!data.uid) throw new HttpsError('invalid-argument', 'uid is required.')

  const user = await auth.getUser(data.uid)
  const link = await auth.generatePasswordResetLink(user.email ?? '')
  return { link }
})

export const writeAuditLog = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.')
  const data = request.data as { action?: string; targetId?: string; targetType?: string }
  const targetTypes = new Set(['patient', 'doctor', 'assignment', 'system'])
  if (!data.action || data.action.length > 120 || !data.targetId || data.targetId.length > 200 || !data.targetType || !targetTypes.has(data.targetType)) {
    throw new HttpsError('invalid-argument', 'action, targetId, and targetType are required.')
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
