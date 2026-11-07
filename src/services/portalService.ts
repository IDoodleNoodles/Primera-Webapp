import type { ClinicalEvidenceRecord, DashboardMetric, DoctorAlert, DoctorLinkRequest, Patient, PatientClinicalEvidence } from '../types'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
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

export type { DoctorLinkRequest }

export type AdminAuditLog = {
  id: string
  actorName: string
  action: string
  timestamp: string
}

export type AdminOverview = {
  doctorWorkload: Array<{ doctorId: string; name: string; patientCount: number }>
  patientsWithoutDoctor: Array<{ displayName: string; signedUpAt: string | null }>
  pipeline: {
    smartwatchSyncsToday: number | null
    voiceCheckInsToday: number | null
    functionErrorCount: number | null
  }
}

type AdminStaffOverview = {
  totalStaff: number
  activeStaff: number
}

export type AdminDashboardData = {
  metrics: DashboardMetric[]
  overview: AdminStaffOverview
  systemOverview: AdminOverview
}

type DoctorOverview = {
  assignedPatients: number
  needsReview: number
  activeAlerts: number
  recentCheckIns: number
}

export type DoctorDashboardData = {
  metrics: DashboardMetric[]
  assignedPatients: Patient[]
  reviewPatients: Patient[]
  overview: DoctorOverview
  linkRequests: DoctorLinkRequest[]
}

export type { DoctorAlert }

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

export function getEmptyAdminDashboard(): AdminDashboardData {
  return {
    metrics: [
      { label: 'Active OBGYNs', value: '0', change: 'No doctor accounts loaded' },
      { label: 'Active staff', value: '0', change: 'No staff accounts loaded' },
    ],
    overview: { totalStaff: 0, activeStaff: 0 },
    systemOverview: {
      doctorWorkload: [],
      patientsWithoutDoctor: [],
      pipeline: { smartwatchSyncsToday: null, voiceCheckInsToday: null, functionErrorCount: null },
    },
  }
}

export function getEmptyDoctorDashboard(): DoctorDashboardData {
  return {
    metrics: [
      { label: 'Assigned patients', value: '0', change: 'No patient accounts loaded' },
      { label: 'Records needing review', value: '0', change: 'No follow-up items' },
      { label: 'Active or new alerts', value: '0', change: 'No alerts in your queue' },
      { label: 'Recent check-ins', value: '0', change: 'No check-ins recorded' },
    ],
    assignedPatients: [],
    reviewPatients: [],
    overview: { assignedPatients: 0, needsReview: 0, activeAlerts: 0, recentCheckIns: 0 },
    linkRequests: [],
  }
}

function toDoctorLinkRequest(id: string, data: Record<string, unknown>, patientName = 'Patient') : DoctorLinkRequest {
  return {
    id,
    patientId: typeof data.patientId === 'string' ? data.patientId : '',
    patientName,
    doctorId: typeof data.doctorId === 'string' ? data.doctorId : '',
    status: data.status === 'accepted' || data.status === 'declined' || data.status === 'cancelled' ? data.status : 'pending',
    createdAt: toIsoTimestamp(data.createdAt),
  }
}

export async function fetchDoctorLinkRequests(doctorId: string): Promise<DoctorLinkRequest[]> {
  if (!db) return []
  const firestore = db
  let snapshot
  try {
    snapshot = await getDocs(query(
      collection(firestore, 'doctorLinkRequests'),
      where('doctorId', '==', doctorId),
      where('status', '==', 'pending'),
      limit(50),
    ))
  } catch {
    snapshot = await getDocs(query(
      collection(firestore, 'doctorLinkRequests'),
      where('doctorId', '==', doctorId),
      limit(50),
    ))
  }
  const requests = await Promise.all(snapshot.docs.map(async (entry) => {
    const patientId = entry.data().patientId
    const profile = typeof patientId === 'string' ? await getDoc(doc(firestore, 'users', patientId)) : null
    return toDoctorLinkRequest(entry.id, entry.data(), profile?.exists() ? readProfileName(profile.data(), 'Patient') : 'Patient')
  }))
  return requests
    .filter((request) => request.status === 'pending')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function respondToDoctorLinkRequest(requestId: string, decision: 'accept' | 'decline') {
  return callAdminFunction<{ success: boolean }>('respondToDoctorLinkRequest', { requestId, decision })
}

export async function fetchStaffAccounts(search = ''): Promise<StaffAccount[]> {
  if (!firebaseConfigured || !db) return []
  const snapshot = await getDocs(query(collection(db, 'users'), where('role', 'in', ['admin', 'doctor']), limit(100)))
  const normalizedSearch = search.trim().toLocaleLowerCase()
  return snapshot.docs
    .map((entry): StaffAccount => ({
      uid: entry.id,
      name: readProfileName(entry.data(), 'Unnamed staff member'),
      email: typeof entry.data().email === 'string' ? entry.data().email : '',
      role: entry.data().role as 'admin' | 'doctor',
      active: entry.data().active !== false,
      specialty: typeof entry.data().specialty === 'string' ? entry.data().specialty : undefined,
    }))
    .filter((entry) => !normalizedSearch || entry.name.toLocaleLowerCase().includes(normalizedSearch))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 100)
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

export function deleteStaffAccount(uid: string) {
  return callAdminFunction<{ uid: string }>('deleteStaffAccount', { uid })
}

export function setStaffAccountStatus(uid: string, active: boolean) {
  return callAdminFunction<{ uid: string; active: boolean }>('setStaffAccountStatus', { uid, active })
}

export function resetStaffPassword(uid: string) {
  return callAdminFunction<{ success: boolean; maskedEmail: string; resetLink: string }>('resetStaffPassword', { uid })
}

export function fetchAdminOverview() {
  return callAdminFunction<AdminOverview>('fetchAdminOverview', {})
}

export async function fetchAdminAuditLogs(): Promise<AdminAuditLog[]> {
  if (!firebaseConfigured || !db) return []
  const firestore = db
  const snapshot = await getDocs(query(collection(firestore, 'auditLogs'), orderBy('timestamp', 'desc'), limit(50)))
  const actorIds = Array.from(new Set(snapshot.docs
    .map((entry) => entry.data().actorId)
    .filter((actorId): actorId is string => typeof actorId === 'string')))
  const actorProfiles = await Promise.all(actorIds.map(async (actorId) => {
    const profile = await getDoc(doc(firestore, 'users', actorId))
    return [actorId, profile.exists() ? readProfileName(profile.data(), 'Unknown staff member') : 'Unknown staff member'] as const
  }))
  const names = new Map(actorProfiles)
  return snapshot.docs.map((entry) => {
    const data = entry.data()
    return {
      id: entry.id,
      actorName: typeof data.actorId === 'string' ? names.get(data.actorId) ?? 'Unknown staff member' : 'Unknown staff member',
      action: typeof data.action === 'string' ? data.action : 'Recorded system action',
      timestamp: toIsoTimestamp(data.timestamp),
    }
  })
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
    pregnancyWeek: data.pregnancyWeek ?? null,
    trimester: data.trimester ?? null,
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

export async function fetchAdminDashboardData(userId: string, patientSearch = ''): Promise<AdminDashboardData> {
  if (!db) return getEmptyAdminDashboard()

  void userId
  void patientSearch
  const [staff, systemOverview] = await Promise.all([fetchStaffAccounts(), fetchAdminOverview()])
  const doctors = staff.filter((account) => account.role === 'doctor')
  const activeDoctors = doctors.filter((doctor) => doctor.active).length
  const activeStaff = staff.filter((account) => account.active).length

  return {
    metrics: [
      { label: 'Active OBGYNs', value: String(activeDoctors), change: `${doctors.length} total doctor accounts` },
      { label: 'Active staff', value: String(activeStaff), change: `${staff.length} total staff accounts` },
    ],
    overview: { totalStaff: staff.length, activeStaff },
    systemOverview,
  }
}

export async function fetchDoctorDashboardData(doctorId: string): Promise<DoctorDashboardData> {
  if (!db) return getEmptyDoctorDashboard()

  const assignedPatients = await fetchVisiblePatients('doctor', doctorId)
  let linkRequests: DoctorLinkRequest[] = []
  try {
    linkRequests = await fetchDoctorLinkRequests(doctorId)
  } catch {
    // A missing request collection or index must not hide assigned patients.
  }
  let alertCount = assignedPatients.reduce((total, patient) => total + patient.alertCount, 0)
  const activeAlertPatientIds = new Set<string>()

  try {
    const alertsSnapshot = await getDocs(
      query(collection(db, 'alerts'), where('doctorId', '==', doctorId)),
    )
    const activeAlerts = alertsSnapshot.docs.filter((entry) => entry.data().status !== 'resolved')
    alertCount = activeAlerts.length
    activeAlerts.forEach((entry) => {
      const patientId = entry.data().patientId
      if (typeof patientId === 'string') activeAlertPatientIds.add(patientId)
    })
  } catch {
    // Keep patient-derived alert count if alerts query is unavailable.
  }

  const reviewPatients = assignedPatients
    .filter((patient) => activeAlertPatientIds.has(patient.id) || patient.alertCount > 0 || patient.unreadNotes > 0 || patient.status === 'escalated')
    .sort((left, right) => right.lastCheckIn.localeCompare(left.lastCheckIn))
  const recentCheckIns = assignedPatients.filter((patient) => patient.lastCheckIn).length

  return {
    metrics: [
      { label: 'Assigned patients', value: String(assignedPatients.length), change: 'Patients currently assigned to you' },
      { label: 'Records needing review', value: String(reviewPatients.length), change: 'Alerts, notes, or follow-up items' },
      { label: 'Active or new alerts', value: String(alertCount), change: alertCount ? 'Review the alert queue' : 'No alerts in your queue' },
      { label: 'Recent check-ins', value: String(recentCheckIns), change: 'Patients with check-in activity' },
    ],
    assignedPatients: assignedPatients.sort((left, right) => right.lastCheckIn.localeCompare(left.lastCheckIn)),
    reviewPatients,
    overview: {
      assignedPatients: assignedPatients.length,
      needsReview: reviewPatients.length,
      activeAlerts: alertCount,
      recentCheckIns,
    },
    linkRequests,
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
    category: data.category === 'recurring-symptom' || data.category === 'approved-rule-match' ? data.category : 'clinician-defined',
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
  category: DoctorAlert['category']
  title: string
  details: string
}) {
  if (!db) throw new Error('Firebase is not configured.')

  const created = await addDoc(collection(db, 'alerts'), {
    doctorId,
    patientId,
    category: payload.category,
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
  category: DoctorAlert['category']
  title: string
  details: string
  status: 'active' | 'resolved'
}) {
  if (!db) throw new Error('Firebase is not configured.')

  await updateDoc(doc(db, 'alerts', alertId), {
    category: payload.category,
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
