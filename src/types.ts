export type Role = 'admin' | 'doctor' | 'patient'

export type UserSession = {
  uid: string
  name: string
  email: string
  role: Role
}

export type Patient = {
  id: string
  name: string
  assignedDoctorId: string | null
  pregnancyWeek?: number | null
  trimester?: string | null
  riskLevel: 'low' | 'moderate' | 'high' | 'critical'
  riskScore: number
  status: 'stable' | 'monitoring' | 'escalated'
  lastCheckIn: string
  symptoms: number
  vitals: {
    heartRate: number
    oxygen: number
    bloodPressure: number
    temperature: number
  }
  alertCount: number
  unreadNotes: number
}

export type ClinicalEvidenceRecord = {
  id: string
  timestamp: string
  title: string
  summary: string
  values: Array<{ label: string; value: string }>
}

export type PatientClinicalEvidence = {
  checkins: ClinicalEvidenceRecord[]
  transcriptions: ClinicalEvidenceRecord[]
  goals: ClinicalEvidenceRecord[]
  smartwatchHealthRecords: ClinicalEvidenceRecord[]
  screeningSignal: {
    score: number | null
    level: Patient['riskLevel'] | null
    reasons: string[]
  }
}

export type AuditLog = {
  id: string
  actorId: string
  actorName: string
  action: string
  targetId: string
  targetType: 'patient' | 'doctor' | 'assignment' | 'system'
  timestamp: string
}

export type DashboardMetric = {
  label: string
  value: string
  change: string
}

export type DoctorAlert = {
  id: string
  patientId: string
  doctorId: string
  category: 'recurring-symptom' | 'approved-rule-match' | 'clinician-defined'
  title: string
  details: string
  status: 'active' | 'resolved'
  createdAt: string
}

export type DoctorLinkRequest = {
  id: string
  patientId: string
  patientName: string
  doctorId: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  createdAt: string
}
