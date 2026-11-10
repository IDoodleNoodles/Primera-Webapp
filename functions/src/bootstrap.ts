import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

if (!getApps().length) initializeApp()

const auth = getAuth()
const db = getFirestore()

async function promptValue(label: string, hidden = false) {
  const value = process.env[label]
  if (value) return value
  if (hidden) {
    throw new Error(`${label} is required in the environment when running non-interactively.`)
  }
  const readline = createInterface({ input, output })
  const answer = await readline.question(`${label}: `)
  readline.close()
  if (!answer.trim()) throw new Error(`${label} is required.`)
  return answer.trim()
}

async function main() {
  const email = await promptValue('ADMIN_EMAIL')
  const password = await promptValue('ADMIN_PASSWORD', true)
  const name = process.env.ADMIN_NAME?.trim() || 'Primera Administrator'

  let user
  try {
    user = await auth.getUserByEmail(email)
    user = await auth.updateUser(user.uid, { password, displayName: name, disabled: false })
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
    user = await auth.createUser({ email, password, displayName: name })
  }

  await auth.setCustomUserClaims(user.uid, { role: 'admin' })
  await db.doc(`users/${user.uid}`).set({
    name,
    email,
    role: 'admin',
    active: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  console.log(`Administrator account ready: ${email} (${user.uid})`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
