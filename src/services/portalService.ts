import type { AuditLog, ClinicalEvidenceRecord, DashboardMetric, DoctorAlert, Patient, PatientClinicalEvidence } from '../types'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db, firebaseConfigured } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'

export type StaffAccount = {
  uid: string
  name: string
  email: string
  role: 'admin' | 'doctor'
  active: boolean
  specialty?: string
}

export type AdminPatient = {
  id: string
  name: string
  assignedDoctorId: string | null
  active: boolean
}

export type PatientInput = Pick<AdminPatient, 'name' | 'assignedDoctorId' | 'active'>

type AdminOverview = {
  totalCases: number
  totalAssigned: number
  unassigned: number
}

export type AdminDashboardData = {
  metrics: DashboardMetric[]
  overview: AdminOverview
  activityLog: AuditLog[]
  patients: AdminPatient[]
}

type DoctorOverview = {
  assignedCases: number
  highRiskCases: number
  criticalCases: number
  averageRisk: number
}

export type DoctorDashboardData = {
  metrics: DashboardMetric[]
  assignedPatients: Patient[]
  reviewPatients: Patient[]
  overview: DoctorOverview
}

export type { DoctorAlert }

function buildOverview(items: Patient[]): AdminOverview {
  if (!items.length) {
    return {
      totalCases: 0,
      totalAssigned: 0,
      unassigned: 0,
    }
  }

  return {
    totalCases: items.length,
    totalAssigned: items.filter((patient) => patient.assignedDoctorId).length,
    unassigned: items.filter((patient) => !patient.assignedDoctorId).length,
  }
}

function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }

  return ''
}

function firstString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof data[key] === 'string' && data[key].trim()) return data[key].trim()
  }
  return ''
}

function readProfileName(data: Record<string, unknown>, fallback: string) {
  const name = firstString(data, ['name', 'displayName', 'fullName'])
  if (name) return name
  const firstName = typeof data.firstName === 'string' ? data.firstName.trim() : ''
  const lastName = typeof data.lastName === 'string' ? data.lastName.trim() : ''
  return [firstName, lastName].filter(Boolean).join(' ') || fallback
}

function isPatientProfile(data: Record<string, unknown>) {
  return data.role === 'patient' || (data.role !== 'admin' && data.role !== 'doctor')
}

function firstNumber(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function toClinicalEvidenceRecord(id: string, data: Record<string, unknown>): ClinicalEvidenceRecord {
  const timestamp = toIsoTimestamp(data.timestamp ?? data.createdAt ?? data.recordedAt ?? data.date)
  const excludedKeys = new Set(['timestamp', 'createdAt', 'recordedAt', 'date', 'userId'])
  const values = Object.entries(data)
    .filter(([key, value]) => !excludedKeys.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 6)
    .map(([label, value]) => ({ label, value: String(value) }))

  return {
    id,
    timestamp,
    title: firstString(data, ['title', 'type', 'name', 'status']) || 'Patient record',
    summary: firstString(data, ['summary', 'symptoms', 'text', 'transcription', 'content', 'description', 'notes']) || 'No narrative details recorded.',
    values,
  }
}

function sortEvidence(records: ClinicalEvidenceRecord[]) {
  return records.sort((left, right) => right.timestamp.localeCompare(left.timestamp))
}

function buildScreeningSignal(records: ClinicalEvidenceRecord[]): PatientClinicalEvidence['screeningSignal'] {
  const latest = records[0]
  if (!latest) return { score: null, level: null, reasons: [] }

  const rawValues = Object.fromEntries(latest.values.map(({ label, value }) => [label, value]))
  const heartRate = firstNumber(rawValues, ['heartRate', 'heart_rate', 'heart rate', 'restingHeartRate', 'pulse'])
  const oxygen = firstNumber(rawValues, ['oxygen', 'oxygenSaturation', 'oxygen_saturation', 'spo2', 'SpO2'])
  const scoreParts: Array<{ points: number; reason: string }> = []
  if (heartRate !== null && heartRate >= 100) scoreParts.push({ points: 25, reason: `Heart rate ${heartRate} bpm is elevated.` })
  if (oxygen !== null && oxygen > 0 && oxygen < 95) scoreParts.push({ points: 35, reason: `Oxygen saturation ${oxygen}% is below 95%.` })
  if (!scoreParts.length) return { score: 0, level: 'low', reasons: ['No threshold signals found in the latest smartwatch record.'] }

  const score = Math.min(100, scoreParts.reduce((total, part) => total + part.points, 0))
  return {
    score,
    level: score >= 60 ? 'high' : score >= 25 ? 'moderate' : 'low',
    reasons: scoreParts.map((part) => part.reason),
  }
}

export async function fetchPatientClinicalEvidence(doctorId: string, patientId: string): Promise<PatientClinicalEvidence> {
  const empty: PatientClinicalEvidence = {
    checkins: [],
    transcriptions: [],
    goals: [],
    smartwatchHealthRecords: [],
    screeningSignal: { score: null, level: null, reasons: [] },
  }
  if (!db) return empty

  const patient = await fetchPatientByIdForDoctor(doctorId, patientId)
  if (!patient) return empty

  const firestore = db
  const loadPatientCollection = (name: 'checkins' | 'transcriptions' | 'goals') => loadQueryDocs(() => getDocs(query(
    collection(firestore, name),
    where('userId', '==', patientId),
    limit(20),
  )))

  const [checkins, transcriptions, goals, smartwatch] = await Promise.all([
    loadPatientCollection('checkins'),
    loadPatientCollection('transcriptions'),
    loadPatientCollection('goals'),
    loadQueryDocs(() => getDocs(collection(firestore, 'users', patientId, 'smartwatchHealthRecords'))),
  ])

  const evidence = {
    checkins: sortEvidence(checkins.map((entry) => toClinicalEvidenceRecord(entry.id, entry.data()))),
    transcriptions: sortEvidence(transcriptions.map((entry) => toClinicalEvidenceRecord(entry.id, entry.data()))),
    goals: sortEvidence(goals.map((entry) => toClinicalEvidenceRecord(entry.id, entry.data()))),
    smartwatchHealthRecords: sortEvidence(smartwatch.map((entry) => toClinicalEvidenceRecord(entry.id, entry.data()))),
  }

  return { ...evidence, screeningSignal: buildScreeningSignal(evidence.smartwatchHealthRecords) }
}

function normalizeTargetType(value: unknown): AuditLog['targetType'] {
  if (value === 'patient' || value === 'doctor' || value === 'assignment' || value === 'system') {
    return value
  }

  return 'system'
}

export function getEmptyAdminDashboard(): AdminDashboardData {
  return {
    metrics: [
      { label: 'Active OBGYNs', value: '0', change: 'No doctor accounts loaded' },
      { label: 'Unassigned cases', value: '0', change: 'Patients without assigned doctor' },
      { label: 'Active patient accounts', value: '0', change: 'No patient accounts loaded' },
    ],
    overview: buildOverview([]),
    activityLog: [],
    patients: [],
  }
}

export function getEmptyDoctorDashboard(): DoctorDashboardData {
  return {
    metrics: [
      { label: 'Assigned cases', value: '0', change: '0 active alerts' },
      { label: 'High-risk cases', value: '0', change: 'High and critical cases' },
      { label: 'Critical cases', value: '0', change: 'Need immediate review' },
      { label: 'Avg risk score', value: '0', change: 'Across assigned patients' },
    ],
    assignedPatients: [],
    reviewPatients: [],
    overview: { assignedCases: 0, highRiskCases: 0, criticalCases: 0, averageRisk: 0 },
  }
}

export async function fetchStaffAccounts(): Promise<StaffAccount[]> {
  if (!firebaseConfigured || !db) return []
  try {
    return await callAdminFunction<StaffAccount[]>('fetchAdminStaffDirectory', {})
  } catch {
    const snapshot = await getDocs(collection(db, 'users'))
    return snapshot.docs
      .filter((entry) => entry.data().role === 'doctor' || entry.data().role === 'admin')
      .map((entry): StaffAccount => ({
        uid: entry.id,
        name: readProfileName(entry.data(), 'Unnamed staff member'),
        email: typeof entry.data().email === 'string' ? entry.data().email : '',
        role: entry.data().role as 'admin' | 'doctor',
        active: entry.data().active !== false,
        specialty: typeof entry.data().specialty === 'string' ? entry.data().specialty : undefined,
      }))
  }
}

export async function createPatient(input: PatientInput) {
  if (!db) throw new Error('Firebase is not configured.')

  const reference = await addDoc(collection(db, 'users'), {
    ...input,
    role: 'patient',
    createdAt: serverTimestamp(),
  })
  return { id: reference.id, ...input }
}

export async function updatePatient(patientId: string, input: PatientInput) {
  if (!db) throw new Error('Firebase is not configured.')
  await updateDoc(doc(db, 'users', patientId), {
    ...input,
    // Normalize legacy records that were created without a role.
    role: 'patient',
  })
  return { id: patientId, ...input }
}

export async function deletePatient(patientId: string) {
  return callAdminFunction<{ id: string }>('deletePatientAccount', { patientId })
}

export async function assignPatient(patientId: string, doctorId: string | null) {
  if (!db) throw new Error('Firebase is not configured.')
  const firestore = db
  const assignments = collection(firestore, 'assignments')
  const existing = await getDocs(query(assignments, where('patientId', '==', patientId)))
  const previousDoctorIds = existing.docs
    .map((entry) => entry.data().doctorId)
    .filter((value): value is string => typeof value === 'string')
  const batch = writeBatch(firestore)
  existing.docs.forEach((entry) => batch.delete(entry.ref))
  batch.update(doc(firestore, 'users', patientId), { assignedDoctorId: doctorId })
  previousDoctorIds.forEach((previousDoctorId) => batch.delete(
    doc(firestore, 'doctors', previousDoctorId, 'assignedPatients', patientId),
  ))
  if (doctorId) {
    batch.set(doc(firestore, 'assignments', `${doctorId}_${patientId}`), {
      patientId,
      doctorId,
      assignedAt: serverTimestamp(),
    })
    batch.set(doc(firestore, 'doctors', doctorId, 'assignedPatients', patientId), {
      patientId,
      assignedAt: serverTimestamp(),
    }, { merge: true })
  }
  await batch.commit()
}

async function callAdminFunction<T>(name: string, data: object) {
  if (!firebaseConfigured) throw new Error('Firebase is not configured.')
  const functions = getFunctions()
  const callable = httpsCallable<object, T>(functions, name)
  return (await callable(data)).data
}

export function createStaffAccount(data: { email: string; password: string; name: string; role: 'admin' | 'doctor' }) {
  return callAdminFunction<{ uid: string }>('createStaffAccount', data)
}

export function updateStaffAccount(data: { uid: string; name: string; role: 'admin' | 'doctor' }) {
  return callAdminFunction<{ uid: string }>('updateStaffAccount', data)
}

export async function updateDoctorName(uid: string, name: string) {
  if (!db) throw new Error('Firebase is not configured.')
  await Promise.all([
    updateDoc(doc(db, 'users', uid), { name, role: 'doctor' }),
    updateDoc(doc(db, 'doctors', uid), { name }),
  ])
  return { uid }
}

export function deleteStaffAccount(uid: string) {
  return callAdminFunction<{ uid: string }>('deleteStaffAccount', { uid })
}

export function setStaffAccountStatus(uid: string, active: boolean) {
  return callAdminFunction<{ uid: string; active: boolean }>('setStaffAccountStatus', { uid, active })
}

export function fetchAdminPatientDirectory() {
  if (!db) return Promise.resolve([] as AdminPatient[])

  return getDocs(collection(db, 'users')).then((snapshot) => snapshot.docs
    .filter((entry) => isPatientProfile(entry.data()))
    .map((entry): AdminPatient => ({
      id: entry.id,
      name: readProfileName(entry.data(), 'Unnamed patient'),
      assignedDoctorId: typeof entry.data().assignedDoctorId === 'string' ? entry.data().assignedDoctorId : null,
      active: entry.data().active !== false,
    })))
}

type FirestorePatient = Partial<Patient> & {
  name?: string
  assignedDoctorId?: string | null
}

function toPatient(id: string, data: FirestorePatient): Patient {
  return {
    id,
    name: data.name ?? 'Unnamed patient',
    assignedDoctorId: data.assignedDoctorId ?? null,
    riskLevel: data.riskLevel ?? 'low',
    riskScore: data.riskScore ?? 0,
    status: data.status ?? 'stable',
    lastCheckIn: toIsoTimestamp(data.lastCheckIn),
    symptoms: data.symptoms ?? 0,
    vitals: data.vitals ?? { heartRate: 0, oxygen: 0, bloodPressure: 0, temperature: 0 },
    alertCount: data.alertCount ?? 0,
    unreadNotes: data.unreadNotes ?? 0,
  }
}

async function loadQueryDocs<T>(run: () => Promise<{ docs: T[] }>) {
  try {
    return (await run()).docs
  } catch {
    return [] as T[]
  }
}

async function doctorHasPatientLink(doctorId: string, patientId: string) {
  if (!db) return false

  const firestore = db
  const [assignedPatient, assignment] = await Promise.all([
    getDoc(doc(firestore, 'doctors', doctorId, 'assignedPatients', patientId)),
    getDoc(doc(firestore, 'assignments', `${doctorId}_${patientId}`)),
  ])

  if (assignedPatient.exists() || assignment.exists()) return true

  const [assignedPatientMatches, assignmentMatches] = await Promise.all([
    loadQueryDocs(() => getDocs(query(
      collection(firestore, 'doctors', doctorId, 'assignedPatients'),
      where('patientId', '==', patientId),
      limit(1),
    ))),
    loadQueryDocs(() => getDocs(query(
      collection(firestore, 'assignments'),
      where('doctorId', '==', doctorId),
      where('patientId', '==', patientId),
      limit(1),
    ))),
  ])

  return assignedPatientMatches.length > 0 || assignmentMatches.length > 0
}

export async function fetchVisiblePatients(role: 'admin' | 'doctor', userId: string) {
  if (!db) return []

  const firestore = db

  if (role === 'admin') {
    const snapshot = await getDocs(collection(firestore, 'users'))
    return snapshot.docs
      .filter((patient) => {
        return isPatientProfile(patient.data())
      })
      .map((patient) => toPatient(patient.id, patient.data()))
  }

  const [assignmentDocs, assignmentRecordDocs, assignedProfileDocs] = await Promise.all([
    loadQueryDocs(() => getDocs(collection(firestore, 'doctors', userId, 'assignedPatients'))),
    loadQueryDocs(() => getDocs(query(collection(firestore, 'assignments'), where('doctorId', '==', userId)))),
    loadQueryDocs(() => getDocs(query(collection(firestore, 'users'), where('assignedDoctorId', '==', userId)))),
  ])

  const patientsById = new Map<string, Patient>()
  for (const profile of assignedProfileDocs) {
    patientsById.set(profile.id, toPatient(profile.id, profile.data()))
  }

  const assignmentPatientIds = Array.from(new Set(
    [
      ...assignmentDocs.map((assignment) => {
        const mappedPatientId = assignment.data().patientId
        return typeof mappedPatientId === 'string' && mappedPatientId.length > 0
          ? mappedPatientId
          : assignment.id
      }),
      ...assignmentRecordDocs
        .map((assignment) => assignment.data().patientId)
        .filter((patientId): patientId is string => typeof patientId === 'string' && patientId.length > 0),
    ],
  ))

  await Promise.all(
    assignmentPatientIds.map(async (mappedPatientId) => {
      if (patientsById.has(mappedPatientId)) return
      try {
        const patient = await getDoc(doc(firestore, 'users', mappedPatientId))
        if (patient.exists()) patientsById.set(patient.id, toPatient(patient.id, patient.data()))
      } catch {
        // Skip profiles the signed-in doctor is not allowed to read.
      }
    }),
  )

  return Array.from(patientsById.values())
}

export async function fetchAdminDashboardData(userId: string): Promise<AdminDashboardData> {
  if (!db) return getEmptyAdminDashboard()

  void userId
  const firestore = db
  const visiblePatients = await fetchAdminPatientDirectory()

  const [doctorSnapshot, auditSnapshot] = await Promise.all([
    getDocs(collection(firestore, 'doctors')),
    getDocs(query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'), limit(8))),
  ])

  const activeDoctors = doctorSnapshot.docs.filter((doctor) => doctor.data().active !== false).length
  const unassignedCases = visiblePatients.filter((patient) => !patient.assignedDoctorId).length

  const overview = {
    totalCases: visiblePatients.length,
    totalAssigned: visiblePatients.length - unassignedCases,
    unassigned: unassignedCases,
  }

  const metrics: DashboardMetric[] = [
    {
      label: 'Active OBGYNs',
      value: String(activeDoctors),
      change: `${doctorSnapshot.size} total doctor accounts`,
    },
    {
      label: 'Active patient accounts',
      value: String(visiblePatients.filter((patient) => patient.active).length),
      change: `${visiblePatients.length} total patient accounts`,
    },
    {
      label: 'Unassigned cases',
      value: String(unassignedCases),
      change: 'Patients without assigned doctor',
    },
    {
      label: 'Audit events',
      value: String(auditSnapshot.size),
      change: 'Recent portal activity',
    },
  ]

  const logs: AuditLog[] = auditSnapshot.docs.map((entry) => {
    const data = entry.data()
    const actorId = typeof data.actorId === 'string' ? data.actorId : ''
    const actorName = typeof data.actorName === 'string' && data.actorName.trim()
      ? data.actorName
      : 'Portal user'

    return {
      id: entry.id,
      actorId,
      actorName,
      action: typeof data.action === 'string' ? data.action : 'Updated record',
      targetId: typeof data.targetId === 'string' ? data.targetId : '',
      targetType: normalizeTargetType(data.targetType),
      timestamp: toIsoTimestamp(data.timestamp),
    }
  })

  return {
    metrics,
    overview,
    activityLog: logs,
    patients: visiblePatients,
  }
}

export async function fetchDoctorDashboardData(doctorId: string): Promise<DoctorDashboardData> {
  if (!db) return getEmptyDoctorDashboard()

  const assignedPatients = await fetchVisiblePatients('doctor', doctorId)
  const highRiskCases = assignedPatients.filter(
    (patient) => patient.riskLevel === 'high' || patient.riskLevel === 'critical',
  ).length
  const criticalCases = assignedPatients.filter((patient) => patient.riskLevel === 'critical').length
  const averageRisk = assignedPatients.length
    ? Math.round(assignedPatients.reduce((total, patient) => total + patient.riskScore, 0) / assignedPatients.length)
    : 0

  let alertCount = assignedPatients.reduce((total, patient) => total + patient.alertCount, 0)

  try {
    const alertsSnapshot = await getDocs(
      query(collection(db, 'alerts'), where('doctorId', '==', doctorId)),
    )
    alertCount = alertsSnapshot.size
  } catch {
    // Keep patient-derived alert count if alerts query is unavailable.
  }

  return {
    metrics: [
      {
        label: 'Assigned cases',
        value: String(assignedPatients.length),
        change: `${alertCount} active alerts`,
      },
      {
        label: 'High-risk cases',
        value: String(highRiskCases),
        change: 'High and critical cases',
      },
      {
        label: 'Critical cases',
        value: String(criticalCases),
        change: 'Need immediate review',
      },
      {
        label: 'Avg risk score',
        value: String(averageRisk),
        change: 'Across assigned patients',
      },
    ],
    assignedPatients: assignedPatients.sort((left, right) => right.riskScore - left.riskScore),
    reviewPatients: assignedPatients
      .filter((patient) => patient.riskLevel === 'high' || patient.riskLevel === 'critical')
      .sort((left, right) => right.riskScore - left.riskScore),
    overview: {
      assignedCases: assignedPatients.length,
      highRiskCases,
      criticalCases,
      averageRisk,
    },
  }
}

export async function fetchPatientByIdForDoctor(doctorId: string, patientId: string): Promise<Patient | null> {
  if (!db) return null

  let profile
  try {
    profile = await getDoc(doc(db, 'users', patientId))
  } catch {
    return null
  }

  if (!profile.exists()) return null

  const patient = toPatient(profile.id, profile.data())
  const assignedOnProfile = patient.assignedDoctorId === doctorId
  const assignedByLink = assignedOnProfile ? true : await doctorHasPatientLink(doctorId, patientId)

  return assignedOnProfile || assignedByLink ? patient : null
}

export async function updatePatientForDoctor(doctorId: string, patientId: string, input: {
  riskLevel: Patient['riskLevel']
  riskScore: number
  status: Patient['status']
  symptoms: number
  vitals: Patient['vitals']
}) {
  if (!db) throw new Error('Firebase is not configured.')

  const patient = await fetchPatientByIdForDoctor(doctorId, patientId)
  if (!patient) throw new Error('Patient is not assigned to this doctor.')

  await updateDoc(doc(db, 'users', patientId), {
    riskLevel: input.riskLevel,
    riskScore: input.riskScore,
    status: input.status,
    symptoms: input.symptoms,
    vitals: input.vitals,
    updatedAt: serverTimestamp(),
  })
  await callAdminFunction<{ success: boolean }>('writeAuditLog', {
    action: 'Updated clinical snapshot',
    targetId: patientId,
    targetType: 'patient',
  })
}

function toDoctorAlert(id: string, data: Record<string, unknown>): DoctorAlert {
  return {
    id,
    patientId: typeof data.patientId === 'string' ? data.patientId : '',
    doctorId: typeof data.doctorId === 'string' ? data.doctorId : '',
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Clinical alert',
    details: typeof data.details === 'string' ? data.details : '',
    status: data.status === 'resolved' ? 'resolved' : 'active',
    createdAt: toIsoTimestamp(data.createdAt),
  }
}

export async function fetchDoctorAlerts(doctorId: string): Promise<DoctorAlert[]> {
  if (!db) return []

  try {
    const snapshot = await getDocs(query(
      collection(db, 'alerts'),
      where('doctorId', '==', doctorId),
      orderBy('createdAt', 'desc'),
      limit(50),
    ))
    return snapshot.docs.map((entry) => toDoctorAlert(entry.id, entry.data()))
  } catch {
    try {
      const snapshot = await getDocs(query(
        collection(db, 'alerts'),
        where('doctorId', '==', doctorId),
        limit(50),
      ))
      return snapshot.docs
        .map((entry) => toDoctorAlert(entry.id, entry.data()))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    } catch {
      return []
    }
  }
}

export async function fetchDoctorAlertsForPatient(doctorId: string, patientId: string): Promise<DoctorAlert[]> {
  if (!db) return []

  try {
    const snapshot = await getDocs(query(
      collection(db, 'alerts'),
      where('doctorId', '==', doctorId),
      where('patientId', '==', patientId),
      orderBy('createdAt', 'desc'),
      limit(20),
    ))
    return snapshot.docs.map((entry) => toDoctorAlert(entry.id, entry.data()))
  } catch {
    try {
      const snapshot = await getDocs(query(
        collection(db, 'alerts'),
        where('doctorId', '==', doctorId),
        limit(50),
      ))
      return snapshot.docs
        .map((entry) => toDoctorAlert(entry.id, entry.data()))
        .filter((alert) => alert.patientId === patientId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 20)
    } catch {
      return []
    }
  }
}

export async function createDoctorAlert(doctorId: string, patientId: string, payload: {
  title: string
  details: string
}) {
  if (!db) throw new Error('Firebase is not configured.')

  const created = await addDoc(collection(db, 'alerts'), {
    doctorId,
    patientId,
    title: payload.title,
    details: payload.details,
    status: 'active',
    resolved: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const saved = await getDoc(created)
  return saved.exists() ? toDoctorAlert(saved.id, saved.data()) : null
}

export async function updateDoctorAlert(alertId: string, payload: {
  title: string
  details: string
  status: 'active' | 'resolved'
}) {
  if (!db) throw new Error('Firebase is not configured.')

  await updateDoc(doc(db, 'alerts', alertId), {
    title: payload.title,
    details: payload.details,
    status: payload.status,
    resolved: payload.status === 'resolved',
    resolvedAt: payload.status === 'resolved' ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteDoctorAlert(alertId: string) {
  if (!db) throw new Error('Firebase is not configured.')
  await deleteDoc(doc(db, 'alerts', alertId))
}
