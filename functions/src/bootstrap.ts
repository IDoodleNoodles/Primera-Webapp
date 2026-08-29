import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth, UserRecord } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()

type StaffConfig = {
  email: string
  password: string
  name: string
  role: 'admin' | 'doctor'
}

async function upsertStaffAccount(config: StaffConfig) {
  let user: UserRecord

  try {
    user = await auth.getUserByEmail(config.email)
    user = await auth.updateUser(user.uid, {
      password: config.password,
      displayName: config.name,
      disabled: false,
    })
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
    user = await auth.createUser({
      email: config.email,
      password: config.password,
      displayName: config.name,
    })
  }

  await auth.setCustomUserClaims(user.uid, { role: config.role })
  await db.doc(`users/${user.uid}`).set({
    name: config.name,
    email: config.email,
    role: config.role,
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  const collection = config.role === 'doctor' ? 'doctors' : 'admins'
  await db.doc(`${collection}/${user.uid}`).set({
    name: config.name,
    email: config.email,
    active: true,
    ...(config.role === 'doctor' ? { specialty: 'OBGYN' } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log(`${config.role} account ready: ${config.email} (${user.uid})`)
}

async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD
  const doctorPassword = process.env.DOCTOR_PASSWORD

  if (!adminPassword || !doctorPassword) {
    throw new Error('Set ADMIN_PASSWORD and DOCTOR_PASSWORD before running bootstrap.')
  }

  await upsertStaffAccount({
    email: process.env.ADMIN_EMAIL ?? 'primera_admin@email.com',
    password: adminPassword,
    name: 'Primera Administrator',
    role: 'admin',
  })
  await upsertStaffAccount({
    email: process.env.DOCTOR_EMAIL ?? 'primera_doctor@email.com',
    password: doctorPassword,
    name: 'Primera OBGYN',
    role: 'doctor',
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
