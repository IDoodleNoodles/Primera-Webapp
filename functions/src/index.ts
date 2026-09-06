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

  try {
    const user = await auth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
    })

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
      const role = entry.data().role
      return role === 'patient'
    })
    .map((entry): AdminPatient => ({
      id: entry.id,
      name: typeof entry.data().name === 'string' ? entry.data().name : 'Unnamed patient',
      assignedDoctorId: typeof entry.data().assignedDoctorId === 'string' ? entry.data().assignedDoctorId : null,
      active: entry.data().active !== false,
    }))
})

export const fetchAdminStaffDirectory = onCall(async (request) => {
  requireAdmin(request)

  const snapshot = await db.collection('users').get()
  return snapshot.docs
    .filter((entry) => entry.data().role === 'doctor')
    .map((entry) => ({
      uid: entry.id,
      name: typeof entry.data().name === 'string' ? entry.data().name : 'Unnamed staff member',
      email: typeof entry.data().email === 'string' ? entry.data().email : '',
      role: 'doctor' as const,
      active: entry.data().active !== false,
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
  await db.doc(`users/${data.uid}`).set({ name: data.name, role: data.role }, { merge: true })
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
  if (!data.action || !data.targetId || !data.targetType) {
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
