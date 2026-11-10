import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment
const patient = { uid: 'patient-1' }
const admin = { uid: 'admin-1' }

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'primera-rules-tests',
    firestore: { rules: fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await Promise.all([
      setDoc(doc(firestore, 'users', patient.uid), { role: 'patient', name: 'Patient One', username: 'patient-one', email: 'patient@example.com', status: 'active', lmpDate: 'private' }),
      setDoc(doc(firestore, 'users', admin.uid), { role: 'admin', name: 'Admin One', active: true }),
      setDoc(doc(firestore, 'auditLogs', 'log-1'), { actorId: admin.uid, action: 'Login', target: 'admin-portal', result: 'success', timestamp: new Date() }),
      setDoc(doc(firestore, 'transcriptions', 'transcription-1'), { userId: patient.uid, text: 'private' }),
      setDoc(doc(firestore, 'checkins', 'checkin-1'), { userId: patient.uid, mood: 'private' }),
      setDoc(doc(firestore, 'users', patient.uid, 'smartwatchHealthRecords', 'record-1'), { heartRate: 100 }),
    ])
  })
})

afterAll(async () => { if (testEnv) await testEnv.cleanup() })

function firestoreFor(uid: string, role: 'admin' | 'patient') {
  return testEnv.authenticatedContext(uid, { role }).firestore()
}

describe('Firestore rules', () => {
  it('denies administrators direct user reads and client audit writes', async () => {
    const firestore = firestoreFor(admin.uid, 'admin')
    await assertFails(getDoc(doc(firestore, 'users', patient.uid)))
    await assertSucceeds(getDoc(doc(firestore, 'auditLogs', 'log-1')))
    await assertFails(setDoc(doc(firestore, 'auditLogs', 'log-2'), { action: 'client write' }))
  })

  it('denies administrators clinical collection reads', async () => {
    const firestore = firestoreFor(admin.uid, 'admin')
    await assertFails(getDoc(doc(firestore, 'transcriptions', 'transcription-1')))
    await assertFails(getDoc(doc(firestore, 'checkins', 'checkin-1')))
    await assertFails(getDoc(doc(firestore, 'users', patient.uid, 'smartwatchHealthRecords', 'record-1')))
  })

  it('allows patient-owner profile and clinical access', async () => {
    const firestore = firestoreFor(patient.uid, 'patient')
    await assertSucceeds(getDoc(doc(firestore, 'users', patient.uid)))
    await assertSucceeds(updateDoc(doc(firestore, 'users', patient.uid), { username: 'updated-name' }))
    await assertSucceeds(addDoc(collection(firestore, 'checkins'), { userId: patient.uid, mood: 'private' }))
    await assertSucceeds(getDoc(doc(firestore, 'transcriptions', 'transcription-1')))
    await assertSucceeds(getDoc(doc(firestore, 'users', patient.uid, 'smartwatchHealthRecords', 'record-1')))
  })

  it('rejects unknown paths and patient writes to audit logs', async () => {
    const firestore = firestoreFor(patient.uid, 'patient')
    await assertFails(getDoc(doc(firestore, 'unknown', 'document')))
    await assertFails(setDoc(doc(firestore, 'auditLogs', 'patient-write'), { action: 'write' }))
  })
})
