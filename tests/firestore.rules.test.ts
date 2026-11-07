import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore'

let testEnv: RulesTestEnvironment

const patient = { uid: 'patient-1' }
const otherPatient = { uid: 'patient-2' }
const doctor = { uid: 'doctor-1' }
const admin = { uid: 'admin-1' }

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'primera-rules-tests',
    firestore: {
      rules: fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore()
    await Promise.all([
      setDoc(doc(firestore, 'users', patient.uid), {
        role: 'patient',
        name: 'Patient One',
        assignedDoctorId: doctor.uid,
      }),
      setDoc(doc(firestore, 'users', otherPatient.uid), { role: 'patient', name: 'Patient Two' }),
      setDoc(doc(firestore, 'users', doctor.uid), { role: 'doctor', name: 'Doctor One' }),
      setDoc(doc(firestore, 'users', admin.uid), { role: 'admin', name: 'Admin One' }),
      setDoc(doc(firestore, 'doctors', doctor.uid), { name: 'Doctor One' }),
      setDoc(doc(firestore, 'doctors', doctor.uid, 'assignedPatients', patient.uid), { patientId: patient.uid }),
      setDoc(doc(firestore, 'assignments', `${doctor.uid}_${patient.uid}`), {
        doctorId: doctor.uid,
        patientId: patient.uid,
      }),
      setDoc(doc(firestore, 'auditLogs', 'log-1'), {
        actorId: admin.uid,
        action: 'Created staff account',
        timestamp: new Date(),
      }),
      setDoc(doc(firestore, 'users', patient.uid, 'pregnancy_history', 'history-1'), {
        pregnancyNumber: 1,
      }),
    ])
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

function firestoreFor(uid: string, role: 'admin' | 'doctor' | 'patient') {
  return testEnv.authenticatedContext(uid, { role }).firestore()
}

describe('Firestore rules', () => {
  it('prevents admins from reading or deleting patient profiles', async () => {
    const firestore = firestoreFor(admin.uid, 'admin')
    await assertFails(getDoc(doc(firestore, 'users', patient.uid)))
    await assertFails(deleteDoc(doc(firestore, 'users', patient.uid)))
  })

  it('prevents profile assignment changes and client assignment writes', async () => {
    const firestore = firestoreFor(patient.uid, 'patient')
    await assertFails(updateDoc(doc(firestore, 'users', patient.uid), { assignedDoctorId: 'doctor-2' }))

    const adminFirestore = firestoreFor(admin.uid, 'admin')
    await assertFails(setDoc(doc(adminFirestore, 'assignments', 'doctor-2_patient-1'), {
      doctorId: 'doctor-2',
      patientId: patient.uid,
    }))
  })

  it('allows patients to edit approved profile fields and create link requests', async () => {
    const firestore = firestoreFor(patient.uid, 'patient')
    await assertSucceeds(updateDoc(doc(firestore, 'users', patient.uid), {
      firstName: 'Patient',
      middleName: 'Q',
      weightKg: 65,
      updatedAt: new Date(),
    }))
    await assertSucceeds(addDoc(collection(firestore, 'doctorLinkRequests'), {
      patientId: patient.uid,
      doctorId: doctor.uid,
      status: 'pending',
    }))
  })

  it('allows doctors to read assigned patients but not unrelated patients', async () => {
    const firestore = firestoreFor(doctor.uid, 'doctor')
    await assertSucceeds(getDoc(doc(firestore, 'users', patient.uid)))
    await assertFails(getDoc(doc(firestore, 'users', otherPatient.uid)))
  })

  it('allows admins to read audit logs but denies client writes', async () => {
    const adminFirestore = firestoreFor(admin.uid, 'admin')
    await assertSucceeds(getDoc(doc(adminFirestore, 'auditLogs', 'log-1')))
    await assertFails(setDoc(doc(adminFirestore, 'auditLogs', 'log-2'), { action: 'client write' }))
  })

  it('allows patients to use pregnancy history and denies unknown paths', async () => {
    const firestore = firestoreFor(patient.uid, 'patient')
    await assertSucceeds(getDoc(doc(firestore, 'users', patient.uid, 'pregnancy_history', 'history-1')))
    await assertSucceeds(setDoc(doc(firestore, 'users', patient.uid, 'pregnancy_history', 'history-2'), {
      pregnancyNumber: 2,
    }))
    await assertFails(getDoc(doc(firestore, 'unhandled', 'document')))
  })
})
