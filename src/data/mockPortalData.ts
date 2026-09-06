import type { AuditLog, DashboardMetric, DoctorAlert, Patient } from '../types'

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
    riskLevel: 'low',
    riskScore: 27,
    status: 'stable',
    lastCheckIn: '2026-08-20T08:00:00Z',
    symptoms: 1,
    vitals: { heartRate: 79, oxygen: 100, bloodPressure: 109, temperature: 98.1 },
    alertCount: 0,
    unreadNotes: 0,
  },
]

export const mockAdminMetrics: DashboardMetric[] = [
  { label: 'Active OBGYNs', value: '18', change: '+2 this month' },
  { label: 'High-risk pregnancies', value: '12', change: '-4 from last week' },
  { label: 'Unassigned cases', value: '5', change: '2 require review' },
  { label: 'Alerts resolved', value: '87%', change: '+11%' },
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
    title: 'Elevated resting heart rate',
    details: 'Smartwatch trend stayed above 100 bpm across the last two check-ins.',
    status: 'active',
    createdAt: '2026-08-18T08:10:00Z',
  },
  {
    id: 'alert-2',
    patientId: 'patient-3',
    doctorId: 'doctor-1',
    title: 'Missed high-risk check-in',
    details: 'No patient-reported check-in since August 16.',
    status: 'active',
    createdAt: '2026-08-19T11:00:00Z',
  },
]

export function getMockAdminDashboard() {
  const adminPatients = mockPatients.map(({ id, name, assignedDoctorId }) => ({
    id,
    name,
    assignedDoctorId,
    active: true,
  }))

  return {
    metrics: mockAdminMetrics.map((metric) => metric.label === 'High-risk pregnancies'
      ? { ...metric, label: 'Active patient accounts', value: String(adminPatients.length), change: `${adminPatients.length} total patient accounts` }
      : metric),
    overview: {
      totalCases: adminPatients.length,
      totalAssigned: adminPatients.filter((patient) => patient.assignedDoctorId).length,
      unassigned: adminPatients.filter((patient) => !patient.assignedDoctorId).length,
      averageRisk: 0,
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
  const highRiskCases = assignedPatients.filter(
    (patient) => patient.riskLevel === 'high' || patient.riskLevel === 'critical',
  ).length
  const criticalCases = assignedPatients.filter((patient) => patient.riskLevel === 'critical').length
  const averageRisk = assignedPatients.length
    ? Math.round(assignedPatients.reduce((total, patient) => total + patient.riskScore, 0) / assignedPatients.length)
    : 0

  return {
    metrics: [
      { label: 'Assigned cases', value: String(assignedPatients.length), change: 'Prototype queue' },
      { label: 'High-risk cases', value: String(highRiskCases), change: 'High and critical cases' },
      { label: 'Critical cases', value: String(criticalCases), change: 'Need immediate review' },
      { label: 'Avg risk score', value: String(averageRisk), change: 'Across assigned patients' },
    ],
    assignedPatients,
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

export function getMockPatientForDoctor(doctorId: string, patientId: string) {
  return getMockAssignedPatients(doctorId).find((patient) => patient.id === patientId)
    ?? getMockAssignedPatients(doctorId)[0]
    ?? null
}

export function getMockDoctorAlerts(doctorId: string, patientId?: string) {
  const assignedIds = new Set(getMockAssignedPatients(doctorId).map((patient) => patient.id))
  return mockDoctorAlerts.filter((alert) => assignedIds.has(alert.patientId) && (!patientId || alert.patientId === patientId))
}
