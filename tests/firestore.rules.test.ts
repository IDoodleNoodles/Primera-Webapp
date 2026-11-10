import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment
const patient = { uid: 'patient-1' }
const admin = { uid: 'admin-1' }
const nonAdmin = { uid: 'visitor-1' }

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-primera',
    firestore: { rules: fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await Promise.all([
      setDoc(doc(firestore, 'admins', admin.uid), { active: true }),
      setDoc(doc(firestore, 'admins', nonAdmin.uid), { active: false }),
      setDoc(doc(firestore, 'accountSummaries', patient.uid), {
        name: 'Patient One', username: 'patient-one', email: 'patient@example.com',
        status: 'active', createdAt: new Date(), lastActive: new Date(),
        nameLower: 'patient one', emailLower: 'patient@example.com',
      }),
      setDoc(doc(firestore, 'users', patient.uid), { role: 'patient', name: 'Patient One' }),
      setDoc(doc(firestore, 'transcriptions', 'transcription-1'), { userId: patient.uid }),
      setDoc(doc(firestore, 'checkins', 'checkin-1'), { userId: patient.uid }),
      setDoc(doc(firestore, 'goals', 'goal-1'), { userId: patient.uid }),
      setDoc(doc(firestore, 'users', patient.uid, 'smartwatchHealthRecords', 'record-1'), { heartRate: 100 }),
      setDoc(doc(firestore, 'users', patient.uid, 'pregnancy_history', 'history-1'), { note: 'private' }),
    ])
  })
})

afterAll(async () => { if (testEnv) await testEnv.cleanup() })

function firestoreFor(uid: string) {
  return testEnv.authenticatedContext(uid).firestore()
}

function validAudit() {
  return {
    actorUid: admin.uid,
    actorEmail: 'admin@example.com',
    action: 'login',
    targetId: 'admin-portal',
    targetType: 'portal',
    result: 'success',
    details: '',
    timestamp: serverTimestamp(),
  }
}

describe('Firestore rules', () => {
  it('allows active admins to read and update only allowed account summary fields', async () => {
    const firestore = firestoreFor(admin.uid)
    await assertSucceeds(getDoc(doc(firestore, 'accountSummaries', patient.uid)))
    await assertSucceeds(updateDoc(doc(firestore, 'accountSummaries', patient.uid), { name: 'Updated', nameLower: 'updated' }))
    await assertFails(updateDoc(doc(firestore, 'accountSummaries', patient.uid), { email: 'changed@example.com' }))
    await assertFails(setDoc(doc(firestore, 'accountSummaries', 'new'), { status: 'active' }))
    await assertFails(deleteDoc(doc(firestore, 'accountSummaries', patient.uid)))
  })

  it('denies admin access to patient and clinical collections', async () => {
    const firestore = firestoreFor(admin.uid)
    await assertFails(getDoc(doc(firestore, 'users', patient.uid)))
    await assertFails(getDoc(doc(firestore, 'transcriptions', 'transcription-1')))
    await assertFails(getDoc(doc(firestore, 'checkins', 'checkin-1')))
    await assertFails(getDoc(doc(firestore, 'goals', 'goal-1')))
    await assertFails(getDoc(doc(firestore, 'users', patient.uid, 'smartwatchHealthRecords', 'record-1')))
    await assertFails(getDoc(doc(firestore, 'users', patient.uid, 'pregnancy_history', 'history-1')))
  })

  it('allows patient owners to retain their own summary and clinical access', async () => {
    const firestore = firestoreFor(patient.uid)
    await assertSucceeds(getDoc(doc(firestore, 'accountSummaries', patient.uid)))
    await assertSucceeds(getDoc(doc(firestore, 'users', patient.uid)))
    await assertSucceeds(updateDoc(doc(firestore, 'users', patient.uid), { name: 'Updated' }))
    await assertSucceeds(addDoc(collection(firestore, 'checkins'), { userId: patient.uid }))
    await assertSucceeds(getDoc(doc(firestore, 'transcriptions', 'transcription-1')))
    await assertSucceeds(getDoc(doc(firestore, 'goals', 'goal-1')))
    await assertSucceeds(getDoc(doc(firestore, 'users', patient.uid, 'smartwatchHealthRecords', 'record-1')))
    await assertSucceeds(getDoc(doc(firestore, 'users', patient.uid, 'pregnancy_history', 'history-1')))
  })

  it('requires the audit actor, timestamp, keys, and allowed action', async () => {
    const firestore = firestoreFor(admin.uid)
    const created = await assertSucceeds(addDoc(collection(firestore, 'auditLogs'), validAudit()))
    await assertFails(updateDoc(created, { result: 'changed' }))
    await assertFails(deleteDoc(created))
    await assertFails(addDoc(collection(firestore, 'auditLogs'), { ...validAudit(), actorUid: 'other' }))
    await assertFails(addDoc(collection(firestore, 'auditLogs'), { ...validAudit(), action: 'unknown' }))
  })

  it('rejects inactive and unauthenticated portal users', async () => {
    const visitor = firestoreFor(nonAdmin.uid)
    await assertFails(getDoc(doc(visitor, 'accountSummaries', patient.uid)))
    await assertFails(getDoc(doc(visitor, 'users', patient.uid)))
    await assertFails(addDoc(collection(visitor, 'auditLogs'), { ...validAudit(), actorUid: nonAdmin.uid }))
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'accountSummaries', patient.uid)))
  })
})
