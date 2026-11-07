import type { Firestore } from 'firebase-admin/firestore'

export type AdminOverview = {
  doctorWorkload: Array<{ doctorId: string; name: string; patientCount: number }>
  patientsWithoutDoctor: Array<{ displayName: string; signedUpAt: string | null }>
  pipeline: {
    smartwatchSyncsToday: number | null
    voiceCheckInsToday: number | null
    functionErrorCount: number | null
  }
}

type RecordData = Record<string, unknown>

function readName(data: RecordData, fallback: string) {
  const directName = [data.name, data.displayName, data.username]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  if (directName) return directName.trim()
  const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : ''
  const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : ''
  return [firstName, lastName].filter(Boolean).join(' ') || fallback
}

function readTimestamp(data: RecordData) {
  const value = data.signedUpAt ?? data.createdAt ?? data.signupAt
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

async function countToday(
  query: () => Promise<{ size: number }>,
) {
  try {
    return (await query()).size
  } catch {
    return null
  }
}

export async function buildAdminOverview(db: Firestore): Promise<AdminOverview> {
  const staffSnapshot = await db.collection('users')
    .where('role', '==', 'doctor')
    .get()
  const patientsSnapshot = await db.collection('users').where('role', '==', 'patient').get()

  const doctorWorkload = await Promise.all(staffSnapshot.docs.map(async (doctor) => {
    const [assignments, assignedPatients] = await Promise.all([
      db.collection('assignments').where('doctorId', '==', doctor.id).get(),
      db.collection(`doctors/${doctor.id}/assignedPatients`).get(),
    ])
    const patientIds = new Set<string>()
    patientsSnapshot.docs.forEach((entry) => {
      if (entry.data().assignedDoctorId === doctor.id) patientIds.add(entry.id)
    })
    assignments.docs.forEach((entry) => {
      const patientId = entry.data().patientId
      if (typeof patientId === 'string') patientIds.add(patientId)
    })
    assignedPatients.docs.forEach((entry) => {
      const patientId = entry.data().patientId
      patientIds.add(typeof patientId === 'string' ? patientId : entry.id)
    })
    return {
      doctorId: doctor.id,
      name: readName(doctor.data(), 'Unnamed doctor'),
      patientCount: patientIds.size,
    }
  }))

  const patientsWithoutDoctor = patientsSnapshot.docs
    .filter((patient) => {
      const assignedDoctorId = patient.data().assignedDoctorId
      return typeof assignedDoctorId !== 'string' || assignedDoctorId.trim().length === 0
    })
    .map((patient) => ({
      displayName: readName(patient.data(), 'Unnamed patient'),
      signedUpAt: readTimestamp(patient.data()),
    }))
    .sort((left, right) => {
      if (!left.signedUpAt) return 1
      if (!right.signedUpAt) return -1
      return left.signedUpAt.localeCompare(right.signedUpAt)
    })

  const today = startOfToday()
  const [smartwatchSyncsToday, voiceCheckInsToday] = await Promise.all([
    countToday(() => db.collectionGroup('smartwatchHealthRecords').where('syncedAt', '>=', today.getTime()).get()),
    countToday(() => db.collection('transcriptions').where('timestamp', '>=', today).get()),
  ])

  return {
    doctorWorkload: doctorWorkload.sort((left, right) => right.patientCount - left.patientCount || left.name.localeCompare(right.name)),
    patientsWithoutDoctor,
    pipeline: {
      smartwatchSyncsToday,
      voiceCheckInsToday,
      functionErrorCount: null,
    },
  }
}
