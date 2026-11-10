import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseConfigured } from '../firebase'
import type { AuditLog, PatientAccount } from '../types'

export type PatientAccountProjection = Omit<PatientAccount, 'uid'>

export type AdminDashboard = {
  totalPatientAccounts: number
  activePatientAccounts: number
  disabledPatientAccounts: number
  recentAuditLogs: AuditLog[]
}

async function call<T>(name: string, data: object): Promise<T> {
  if (!firebaseConfigured) throw new Error('Firebase is not configured.')
  const callable = httpsCallable<object, T>(getFunctions(), name)
  return (await callable(data)).data
}

export async function recordLogin() {
  return call<{ success: boolean }>('recordAdminLogin', {})
}

export async function recordLogout() {
  return call<{ success: boolean }>('recordAdminLogout', {})
}

export async function recordAuthFailure() {
  return call<{ accepted: boolean }>('recordAuthFailure', {})
}

export async function fetchAdminDashboard(): Promise<AdminDashboard> {
  return call<AdminDashboard>('fetchAdminDashboard', {})
}

export async function fetchPatientAccounts(search = ''): Promise<PatientAccount[]> {
  const result = await call<{ accounts: Record<string, PatientAccountProjection> }>('fetchPatientAccounts', { search })
  return Object.entries(result.accounts).map(([uid, account]) => ({ uid, ...account }))
}

export function updatePatientAccount(uid: string, fields: { name?: string; username?: string; status?: string }) {
  return call<{ account: PatientAccount }>('updatePatientAccount', { uid, fields })
}

export function setPatientAccountStatus(uid: string, status: string) {
  return call<{ account: PatientAccount }>('setPatientAccountStatus', { uid, status })
}

export function resetPatientPassword(uid: string) {
  return call<{ success: boolean }>('resetPatientPassword', { uid })
}

export async function fetchAuditLogs(filter = ''): Promise<AuditLog[]> {
  const result = await call<{ logs: AuditLog[] }>('fetchAuditLogs', { filter })
  return result.logs
}

export function recordAuditExport(filter: string, rowCount: number) {
  return call<{ success: boolean }>('recordAuditExport', { filter, rowCount })
}
