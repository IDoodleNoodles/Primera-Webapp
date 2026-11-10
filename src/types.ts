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
  createdAt: string
  lastActive: string
}

export type AuditLog = {
  id: string
  actorUid: string
  actorEmail: string
  action: string
  targetId: string
  targetType: string
  timestamp: string
  result: string
  details: string
}
