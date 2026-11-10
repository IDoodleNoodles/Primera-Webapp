import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const dryRun = process.argv.includes('--dry-run')
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
const projectId = process.env.FIREBASE_PROJECT_ID

if (emulatorHost && !['127.0.0.1:8080', 'localhost:8080'].includes(emulatorHost)) {
  throw new Error('Refusing to run: FIRESTORE_EMULATOR_HOST must be localhost:8080 or 127.0.0.1:8080.')
}
if (authEmulatorHost && !['127.0.0.1:9099', 'localhost:9099'].includes(authEmulatorHost)) {
  throw new Error('Refusing to run: FIREBASE_AUTH_EMULATOR_HOST must be localhost:9099 or 127.0.0.1:9099.')
}
if ((emulatorHost || authEmulatorHost) && projectId !== 'demo-primera') {
  throw new Error('Refusing to run: emulator backfills require FIREBASE_PROJECT_ID=demo-primera.')
}
if (!emulatorHost && authEmulatorHost) {
  throw new Error('Refusing to run: FIRESTORE_EMULATOR_HOST must also be set for emulator backfills.')
}
if (!emulatorHost && (!projectId || projectId === 'demo-primera')) {
  throw new Error('Refusing to run without an explicit non-emulator FIREBASE_PROJECT_ID.')
}

const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!rawCredentials) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON to a service-account JSON value.')
const credentials = JSON.parse(rawCredentials)

if (!getApps().length) initializeApp({ credential: cert(credentials), projectId })
const firestore = getFirestore()
const users = await firestore.collection('users').get()
const allowedFields = ['name', 'username', 'email', 'status', 'createdAt', 'lastActive', 'nameLower', 'emailLower']

for (const user of users.docs) {
  const data = user.data()
  const name = String(data.name ?? '')
  const email = String(data.email ?? '')
  const summary = Object.fromEntries(allowedFields.map((field) => [field, data[field] ?? '']))
  summary.name = name
  summary.email = email
  summary.nameLower = name.toLowerCase()
  summary.emailLower = email.toLowerCase()
  if (!['active', 'disabled'].includes(summary.status)) summary.status = 'active'
  if (dryRun) {
    console.log(`[dry-run] ${user.id}`, summary)
  } else {
    await firestore.collection('accountSummaries').doc(user.id).set(summary, { merge: false })
    console.log(`backfilled ${user.id}`)
  }
}

console.log(`${dryRun ? 'Would process' : 'Processed'} ${users.size} account summaries.`)
