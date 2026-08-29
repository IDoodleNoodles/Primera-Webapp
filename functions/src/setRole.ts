import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()
const validRoles = new Set(['admin', 'doctor', 'user'])

async function main() {
  const email = process.argv[2]
  const role = process.argv[3]

  if (!email || !role || !validRoles.has(role)) {
    throw new Error('Usage: npm run set-role -- <email> <admin|doctor|user>')
  }

  const user = await auth.getUserByEmail(email)
  await auth.setCustomUserClaims(user.uid, { role })
  await db.doc(`users/${user.uid}`).set({
    email,
    role,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  if (role === 'doctor') {
    await db.doc(`doctors/${user.uid}`).set({
      email,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  console.log(`Assigned role '${role}' to ${email} (${user.uid}).`)
  console.log('Sign out and sign back in to refresh the Firebase ID token.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
