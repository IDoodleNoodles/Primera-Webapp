export type Role = 'admin' | 'doctor' | 'user'

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
  title: string
  details: string
  status: 'active' | 'resolved'
  createdAt: string
}
