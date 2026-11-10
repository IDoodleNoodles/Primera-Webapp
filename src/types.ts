export type Role = 'admin'

export type UserSession = {
  uid: string
  name: string
  email: string
  role: Role
}

export type PatientAccount = {
  uid: string
  name: string
  username: string
  email: string
  status: string
  registrationDate: string
  lastActive: string
}

export type AuditLog = {
  id: string
  actorId: string | null
  actorName: string
  action: string
  target: string
  timestamp: string
  result: string
}
