import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()

async function main() {
  const email = process.argv[2]
  if (!email || process.argv[3] !== 'admin') {
    throw new Error('Usage: npm run set-role -- <email> admin')
  }

  const user = await auth.getUserByEmail(email)
  await auth.setCustomUserClaims(user.uid, { role: 'admin' })
  await db.doc(`users/${user.uid}`).set({
    email,
    role: 'admin',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  console.log(`Assigned administrator role to ${email} (${user.uid}).`)
  console.log('Sign out and sign back in to refresh the Firebase ID token.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
