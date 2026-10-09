import type { AuditLog, ClinicalEvidenceRecord, DashboardMetric, DoctorAlert, DoctorLinkRequest, Patient, PatientClinicalEvidence } from '../types'

export const mockDoctors = [
  { id: 'doctor-1', name: 'Dr. Patel', specialty: 'Maternal-Fetal Medicine' },
  { id: 'doctor-2', name: 'Dr. Nguyen', specialty: 'OBGYN' },
  { id: 'doctor-3', name: 'Dr. Silva', specialty: 'High-Risk Pregnancy' },
]

export const mockPatients: Patient[] = [
  {
    id: 'patient-1',
    name: 'Maria Gomez',
    assignedDoctorId: 'doctor-1',
    pregnancyWeek: 28,
    trimester: 'Third trimester',
    riskLevel: 'high',
    riskScore: 82,
    status: 'escalated',
    lastCheckIn: '2026-08-18T07:45:00Z',
    symptoms: 6,
    vitals: { heartRate: 104, oxygen: 97, bloodPressure: 132, temperature: 98.6 },
    alertCount: 3,
    unreadNotes: 2,
  },
  {
    id: 'patient-2',
    name: 'Alicia Brown',
    assignedDoctorId: 'doctor-2',
    pregnancyWeek: 22,
    trimester: 'Second trimester',
    riskLevel: 'moderate',
    riskScore: 54,
    status: 'monitoring',
    lastCheckIn: '2026-08-19T09:15:00Z',
    symptoms: 3,
    vitals: { heartRate: 92, oxygen: 99, bloodPressure: 118, temperature: 98.2 },
    alertCount: 1,
    unreadNotes: 0,
  },
  {
    id: 'patient-3',
    name: 'Zoe Williams',
    assignedDoctorId: null,
    riskLevel: 'critical',
    riskScore: 91,
    status: 'escalated',
    lastCheckIn: '2026-08-16T14:00:00Z',
    symptoms: 7,
    vitals: { heartRate: 112, oxygen: 96, bloodPressure: 138, temperature: 99.1 },
    alertCount: 4,
    unreadNotes: 1,
  },
  {
    id: 'patient-4',
    name: 'Rosa Chen',
    assignedDoctorId: 'doctor-1',
    pregnancyWeek: 18,
    trimester: 'Second trimester',
    riskLevel: 'low',
    riskScore: 27,
    status: 'stable',
    lastCheckIn: '2026-08-20T08:00:00Z',
    symptoms: 1,
    vitals: { heartRate: 79, oxygen: 100, bloodPressure: 109, temperature: 98.1 },
    alertCount: 0,
    unreadNotes: 0,
  },
  {
    id: 'patient-5',
    name: 'Nia Thompson',
    assignedDoctorId: 'doctor-2',
    riskLevel: 'moderate',
    riskScore: 48,
    status: 'monitoring',
    lastCheckIn: '2026-08-20T11:30:00Z',
    symptoms: 2,
    vitals: { heartRate: 88, oxygen: 98, bloodPressure: 121, temperature: 98.4 },
    alertCount: 1,
    unreadNotes: 1,
  },
  {
    id: 'patient-6',
    name: 'Elena Martinez',
    assignedDoctorId: 'doctor-3',
    pregnancyWeek: 12,
    trimester: 'First trimester',
    riskLevel: 'low',
    riskScore: 19,
    status: 'stable',
    lastCheckIn: '2026-08-21T08:20:00Z',
    symptoms: 0,
    vitals: { heartRate: 76, oxygen: 99, bloodPressure: 112, temperature: 98.0 },
    alertCount: 0,
    unreadNotes: 0,
  },
  {
    id: 'patient-7',
    name: 'Grace Okafor',
    assignedDoctorId: null,
    riskLevel: 'high',
    riskScore: 76,
    status: 'escalated',
    lastCheckIn: '2026-08-17T16:10:00Z',
    symptoms: 5,
    vitals: { heartRate: 101, oxygen: 95, bloodPressure: 134, temperature: 99.0 },
    alertCount: 2,
    unreadNotes: 2,
  },
  {
    id: 'patient-8',
    name: 'Sofia Anderson',
    assignedDoctorId: 'doctor-1',
    riskLevel: 'moderate',
    riskScore: 43,
    status: 'monitoring',
    lastCheckIn: '2026-08-19T13:40:00Z',
    symptoms: 2,
    vitals: { heartRate: 90, oxygen: 98, bloodPressure: 119, temperature: 98.5 },
    alertCount: 1,
    unreadNotes: 0,
  },
]

export const mockAdminMetrics: DashboardMetric[] = [
  { label: 'Active OBGYNs', value: '18', change: '+2 this month' },
  { label: 'Unassigned cases', value: '5', change: '2 require review' },
  { label: 'Audit events', value: '3', change: 'Recent portal activity' },
]

export const mockActivityLog: AuditLog[] = [
  {
    id: 'audit-1',
    actorId: 'admin-1',
    actorName: 'Admin Rivera',
    action: 'Assigned pregnancy case to Dr. Patel',
    targetId: 'patient-1',
    targetType: 'assignment',
    timestamp: '2026-08-20T09:15:00Z',
  },
  {
    id: 'audit-2',
    actorId: 'doctor-1',
    actorName: 'Dr. Patel',
    action: 'Reviewed smartwatch vitals and symptom trend',
    targetId: 'patient-1',
    targetType: 'patient',
    timestamp: '2026-08-20T10:05:00Z',
  },
  {
    id: 'audit-3',
    actorId: 'admin-1',
    actorName: 'Admin Rivera',
    action: 'Disabled access for inactive OBGYN',
    targetId: 'doctor-3',
    targetType: 'doctor',
    timestamp: '2026-08-19T16:42:00Z',
  },
]

export const mockDoctorAlerts: DoctorAlert[] = [
  {
    id: 'alert-1',
    patientId: 'patient-1',
    doctorId: 'doctor-1',
    category: 'approved-rule-match',
    title: 'Repeated resting heart-rate readings for review',
    details: 'Smartwatch readings were above 100 bpm across the last two check-ins.',
    status: 'active',
    createdAt: '2026-08-18T08:10:00Z',
  },
  {
    id: 'alert-2',
    patientId: 'patient-3',
    doctorId: 'doctor-1',
    category: 'approved-rule-match',
    title: 'Check-in not recorded',
    details: 'No patient-reported check-in has been recorded since August 16.',
    status: 'active',
    createdAt: '2026-08-19T11:00:00Z',
  },
]

export const mockDoctorLinkRequests: DoctorLinkRequest[] = [
  {
    id: 'request-1',
    patientId: 'patient-7',
    patientName: 'Grace Okafor',
    doctorId: 'doctor-1',
    status: 'pending',
    createdAt: '2026-08-21T09:30:00Z',
  },
]

export function getMockAdminDashboard() {
  const adminPatients = mockPatients.map(({ id, name, assignedDoctorId }) => ({
    id,
    name,
    assignedDoctorId,
    active: true,
    activationStatus: 'active' as const,
  }))

  return {
    metrics: [
      mockAdminMetrics[0],
      { label: 'Active patient accounts', value: String(adminPatients.length), change: `${adminPatients.length} total patient accounts` },
      mockAdminMetrics[1],
      mockAdminMetrics[2],
    ],
    overview: {
      totalCases: adminPatients.length,
      totalAssigned: adminPatients.filter((patient) => patient.assignedDoctorId).length,
      unassigned: adminPatients.filter((patient) => !patient.assignedDoctorId).length,
    },
    activityLog: mockActivityLog,
    patients: adminPatients,
  }
}

export function getMockStaffAccounts() {
  return mockDoctors.map((doctor) => ({
    uid: doctor.id,
    name: doctor.name,
    email: '',
    role: 'doctor' as const,
    active: true,
    specialty: doctor.specialty,
  }))
}

export function getMockAssignedPatients(doctorId: string) {
  const matched = mockPatients.filter((patient) => patient.assignedDoctorId === doctorId)
  if (matched.length) return matched
  return mockPatients.filter((patient) => patient.assignedDoctorId)
}

export function getMockDoctorDashboard(doctorId: string) {
  const assignedPatients = getMockAssignedPatients(doctorId)
  const reviewPatients = assignedPatients
    .filter((patient) => patient.alertCount > 0 || patient.unreadNotes > 0 || patient.status === 'escalated')
    .sort((left, right) => right.lastCheckIn.localeCompare(left.lastCheckIn))
  const activeAlerts = assignedPatients.reduce((total, patient) => total + patient.alertCount, 0)
  const recentCheckIns = assignedPatients.filter((patient) => patient.lastCheckIn).length

  return {
    metrics: [
      { label: 'Assigned patients', value: String(assignedPatients.length), change: 'Patients currently assigned to you' },
      { label: 'Records needing review', value: String(reviewPatients.length), change: 'Alerts, notes, or follow-up items' },
      { label: 'Active or new alerts', value: String(activeAlerts), change: activeAlerts ? 'Review the alert queue' : 'No alerts in your queue' },
      { label: 'Recent check-ins', value: String(recentCheckIns), change: 'Patients with check-in activity' },
    ],
    assignedPatients: [...assignedPatients].sort((left, right) => right.lastCheckIn.localeCompare(left.lastCheckIn)),
    reviewPatients,
    overview: {
      assignedPatients: assignedPatients.length,
      needsReview: reviewPatients.length,
      activeAlerts,
      recentCheckIns,
    },
    linkRequests: mockDoctorLinkRequests.filter((request) => request.doctorId === doctorId && request.status === 'pending'),
  }
}

export function getMockPatientForDoctor(doctorId: string, patientId: string) {
  return getMockAssignedPatients(doctorId).find((patient) => patient.id === patientId)
    ?? getMockAssignedPatients(doctorId)[0]
    ?? null
}

export function getMockDoctorAlerts(doctorId: string, patientId?: string) {
  const assignedIds = new Set(getMockAssignedPatients(doctorId).map((patient) => patient.id))
  return mockDoctorAlerts.filter((alert) => assignedIds.has(alert.patientId) && (!patientId || alert.patientId === patientId))
}

export function getMockPatientClinicalEvidence(doctorId: string, patientId: string): PatientClinicalEvidence {
  const patient = getMockPatientForDoctor(doctorId, patientId)
  if (!patient) return { checkins: [], transcriptions: [], goals: [], smartwatchHealthRecords: [], screeningSignal: { score: null, level: null, reasons: [] } }

  const checkins: ClinicalEvidenceRecord[] = [
    { id: `${patient.id}-checkin-1`, timestamp: patient.lastCheckIn, title: 'Daily check-in', summary: 'Mild fatigue and occasional lower-back discomfort. Mood is steady; medication taken as scheduled.', values: [{ label: 'Mood', value: 'Steady' }, { label: 'Sleep', value: '6h 45m' }, { label: 'Medication', value: 'Taken' }] },
    { id: `${patient.id}-checkin-2`, timestamp: '2026-08-17T08:10:00Z', title: 'Daily check-in', summary: 'Reported good appetite with recurring fatigue after activity.', values: [{ label: 'Mood', value: 'Good' }, { label: 'Sleep', value: '7h 10m' }, { label: 'Medication', value: 'Taken' }] },
  ]
  const smartwatchHealthRecords: ClinicalEvidenceRecord[] = [
    { id: `${patient.id}-health-1`, timestamp: patient.lastCheckIn, title: 'Health Connect sync', summary: 'Latest wearable and activity summary.', values: [{ label: 'Heart rate', value: `${patient.vitals.heartRate} bpm` }, { label: 'Steps', value: '6,240' }, { label: 'Sleep', value: '6h 45m' }] },
    { id: `${patient.id}-health-2`, timestamp: '2026-08-17T08:00:00Z', title: 'Health Connect sync', summary: 'Previous wearable and activity summary.', values: [{ label: 'Heart rate', value: `${Math.max(60, patient.vitals.heartRate - 3)} bpm` }, { label: 'Steps', value: '7,105' }, { label: 'Sleep', value: '7h 10m' }] },
  ]
  return {
    checkins,
    transcriptions: [],
    goals: [{ id: `${patient.id}-goal-1`, timestamp: patient.lastCheckIn, title: 'Wellness goal', summary: 'Daily movement goal', values: [{ label: 'Progress', value: 'In progress' }] }],
    smartwatchHealthRecords,
    screeningSignal: patient.alertCount ? { score: patient.riskScore, level: patient.riskLevel, reasons: ['Review the patient-reported symptoms and latest connected health data.'] } : { score: 0, level: 'low', reasons: [] },
  }
}
