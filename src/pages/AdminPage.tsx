import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { firebaseConfigured } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { adminSection } from './adminSection'
import {
  createStaffAccount,
  deleteStaffAccount,
  fetchAdminAuditLogs,
  fetchAdminDashboardData,
  fetchStaffAccounts,
  resetStaffPassword,
  setStaffAccountStatus,
  updateStaffAccount,
} from '../services/portalService'
import type { AdminAuditLog, AdminDashboardData, StaffAccount } from '../services/portalService'

const emptyStaff = { name: '', email: '', password: '', role: 'doctor' as 'admin' | 'doctor' }
type Operation = 'staff-save' | 'staff-status' | 'staff-delete' | 'staff-reset'
type Confirmation = {
  title: string
  description: string
  confirmLabel: string
  action: () => Promise<void>
}

function formatDate(value: string | null) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Not available' : date.toLocaleString()
}

function signupAge(value: string | null) {
  if (!value) return 'Signup date unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Signup date unavailable'
  const days = Math.max(0, Math.floor((Date.now() - date.valueOf()) / 86400000))
  if (days === 0) return 'Signed up today'
  if (days === 1) return 'Signed up 1 day ago'
  return `Signed up ${days} days ago`
}

function downloadAuditLog(logs: AdminAuditLog[]) {
  const rows = [
    ['Who', 'What', 'When'],
    ...logs.map((log) => [log.actorName, log.action, formatDate(log.timestamp)]),
  ]
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = 'primera-audit-log.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

function Overview({ dashboard, auditLogs, auditError, onRetryAudit }: {
  dashboard: AdminDashboardData
  auditLogs: AdminAuditLog[]
  auditError: string
  onRetryAudit: () => void
}) {
  const workload = dashboard.systemOverview.doctorWorkload
  const maxWorkload = Math.max(1, ...workload.map((doctor) => doctor.patientCount))
  const pipeline = dashboard.systemOverview.pipeline

  return (
    <>
      <section className="metric-grid" aria-label="Staff summary">
        <article className="metric-card"><span>Active staff</span><strong>{dashboard.overview.activeStaff}</strong><small>Currently enabled accounts</small></article>
        <article className="metric-card"><span>Total staff</span><strong>{dashboard.overview.totalStaff}</strong><small>Admin and doctor accounts</small></article>
      </section>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Audit log</p><h3>Recent activity</h3></div><button className="button" disabled={!auditLogs.length} onClick={() => downloadAuditLog(auditLogs)}>Export</button></div>
          {auditError ? <div className="state-block state-error"><p>{auditError}</p><button className="button" onClick={onRetryAudit}>Retry</button></div> : auditLogs.length === 0 ? <div className="state-block"><p>No audit activity is available.</p></div> : <ol className="log-list">{auditLogs.map((log) => <li key={log.id}><div><strong>{log.actorName}</strong><span>{log.action}</span></div><time dateTime={log.timestamp}>{formatDate(log.timestamp)}</time></li>)}</ol>}
        </section>

        <div className="overview-stack">
          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Doctor workload</p><h3>Assigned patients</h3></div></div>
            {workload.length === 0 ? <div className="state-block"><p>No doctor workload data is available.</p></div> : <ul className="workload-list">{workload.map((doctor) => <li key={doctor.doctorId}><div className="workload-label"><span>{doctor.name}</span><strong>{doctor.patientCount}</strong></div><div className="workload-track" aria-label={`${doctor.name}: ${doctor.patientCount} patients`}><span style={{ width: `${(doctor.patientCount / maxWorkload) * 100}%` }} /></div></li>)}</ul>}
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Patients without a doctor</p><h3>{dashboard.systemOverview.patientsWithoutDoctor.length} waiting</h3></div></div>
            {dashboard.systemOverview.patientsWithoutDoctor.length === 0 ? <div className="state-block"><p>No patients are waiting for a doctor.</p></div> : <ul className="list">{dashboard.systemOverview.patientsWithoutDoctor.map((patient, index) => <li key={`${patient.displayName}-${patient.signedUpAt}-${index}`}><span><strong>{patient.displayName}</strong><small>{signupAge(patient.signedUpAt)}</small></span></li>)}</ul>}
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Data pipeline</p><h3>Today</h3></div></div>
            <ul className="pipeline-list">
              <li><span>Smartwatch syncs</span><strong>{pipeline.smartwatchSyncsToday ?? 'Not available'}</strong></li>
              <li><span>Voice check-ins</span><strong>{pipeline.voiceCheckInsToday ?? 'Not available'}</strong></li>
              <li><span>Function errors</span><span className={`status-badge ${pipeline.functionErrorCount === null ? 'status-unknown' : pipeline.functionErrorCount > 0 ? 'status-warning' : 'status-good'}`}>{pipeline.functionErrorCount === null ? 'Not available' : pipeline.functionErrorCount > 0 ? `${pipeline.functionErrorCount} errors` : 'No errors recorded'}</span></li>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}

export function AdminPage() {
  const { user } = useAuth()
  const section = adminSection(useLocation().pathname)
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])
  const [staff, setStaff] = useState<StaffAccount[]>([])
  const [staffForm, setStaffForm] = useState(emptyStaff)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [busyOperation, setBusyOperation] = useState<Operation | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(firebaseConfigured)
  const [dashboardError, setDashboardError] = useState(firebaseConfigured ? '' : 'Firebase is not configured. Live overview data is unavailable.')
  const [auditError, setAuditError] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const [auditRetry, setAuditRetry] = useState(0)
  const visibleStaff = section === 'doctors' ? staff.filter((account) => account.role === 'doctor') : staff

  useEffect(() => {
    if (user?.role !== 'admin') return
    if (!firebaseConfigured) {
      return
    }
    Promise.all([fetchAdminDashboardData(user.uid), fetchStaffAccounts(staffSearch)])
      .then(([nextDashboard, nextStaff]) => {
        setDashboard(nextDashboard)
        setStaff(nextStaff)
        setDashboardError('')
      })
      .catch((loadError) => {
        const detail = loadError instanceof Error ? ` ${loadError.message}` : ''
        setDashboardError(`Unable to load live overview data.${detail}`)
        setDashboard(null)
      })
      .finally(() => setLoading(false))
  }, [user, staffSearch, retry])

  useEffect(() => {
    if (user?.role !== 'admin' || !firebaseConfigured) return
    fetchAdminAuditLogs()
      .then((logs) => { setAuditLogs(logs); setAuditError('') })
      .catch((loadError) => {
        const detail = loadError instanceof Error ? ` ${loadError.message}` : ''
        setAuditError(`Unable to load the audit log.${detail}`)
        setAuditLogs([])
      })
  }, [user, auditRetry, retry])

  function showError(value: unknown) {
    setMessage('')
    setError(value instanceof Error ? value.message : 'The operation could not be completed.')
  }

  async function saveStaff(event: React.FormEvent) {
    event.preventDefault()
    const name = staffForm.name.trim()
    if (name.length < 2) { setError('Enter a staff name with at least 2 characters.'); return }
    if (!editingStaffId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffForm.email.trim())) { setError('Enter a valid staff email address.'); return }
    if (!editingStaffId && staffForm.password.length < 8) { setError('Temporary passwords must be at least 8 characters.'); return }
    setBusyOperation('staff-save'); setError(''); setMessage('')
    try {
      const role = section === 'doctors' ? 'doctor' : staffForm.role
      if (editingStaffId) await updateStaffAccount({ uid: editingStaffId, name, role })
      else await createStaffAccount({ ...staffForm, name, email: staffForm.email.trim(), role })
      setStaffForm(emptyStaff); setEditingStaffId(null); setRetry((value) => value + 1); setMessage('Staff account saved.')
    } catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
  }

  async function toggleStaff(account: StaffAccount) {
    setBusyOperation('staff-status'); setError('')
    try { await setStaffAccountStatus(account.uid, !account.active); setStaff((current) => current.map((item) => item.uid === account.uid ? { ...item, active: !item.active } : item)); setMessage(`Account ${account.active ? 'disabled' : 'enabled'}.`) }
    catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
  }

  async function resetStaff(account: StaffAccount) {
    setBusyOperation('staff-reset'); setError('')
    try { const result = await resetStaffPassword(account.uid); setMessage(`Password reset link issued for ${account.name} (${result.maskedEmail}).`) }
    catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
  }

  function removeStaff(account: StaffAccount) {
    setConfirmation({
      title: `Delete ${account.name}'s staff account?`,
      description: 'This permanently removes their portal access and staff profile. This action cannot be undone.',
      confirmLabel: 'Delete account',
      action: async () => {
        setBusyOperation('staff-delete'); setError('')
        try { await deleteStaffAccount(account.uid); setStaff((current) => current.filter((item) => item.uid !== account.uid)); setMessage('Staff account deleted.') }
        catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
      },
    })
  }

  if (loading && !dashboard) return <div className="page"><section className="panel state-block"><p className="eyebrow">Loading</p><h2>Fetching live overview data</h2></section></div>
  if (!dashboard) return <div className="page"><section className="panel state-block state-error"><p className="eyebrow">Overview unavailable</p><h2>We could not load the admin overview</h2><p className="muted">{dashboardError}</p><button className="button primary" onClick={() => setRetry((value) => value + 1)}>Retry</button></section></div>

  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">Admin portal</p><h2>{section === 'overview' ? 'System overview' : 'Doctor registry'}</h2></div>{section === 'overview' && <Link className="button primary" to="/admin/doctors">Add staff account</Link>}</header>
      {message && <p className="form-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}
      {dashboardError && <p className="form-error">{dashboardError} <button className="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}

      {section === 'overview' ? <Overview dashboard={dashboard} auditLogs={auditLogs} auditError={auditError} onRetryAudit={() => setAuditRetry((value) => value + 1)} /> : <section className="panel admin-management">
        <div className="panel-heading"><div><p className="eyebrow">Staff access</p><h3>{editingStaffId ? 'Edit staff account' : 'Create staff account'}</h3></div></div>
        <p className="muted">Manage staff accounts only. Patient records, clinical data, assignments, and requests are not available to administrators.</p>
        <form className="admin-form" onSubmit={saveStaff}>
          <label>Name<input required minLength={2} value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} /></label>
          {!editingStaffId && <label>Email<input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} /></label>}
          {!editingStaffId && <label>Temporary password<input required type="password" minLength={8} value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} /></label>}
          <div className="form-actions"><button className="button primary" disabled={busyOperation === 'staff-save'}>{busyOperation === 'staff-save' ? 'Saving...' : editingStaffId ? 'Update account' : 'Create account'}</button>{editingStaffId && <button type="button" className="button" onClick={() => { setEditingStaffId(null); setStaffForm(emptyStaff) }}>Cancel</button>}</div>
        </form>
        <label>Search staff<input type="search" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Search by name" /></label>
        {staff.length === 0 ? <div className="state-block"><p>No staff accounts are available.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleStaff.map((account) => <tr key={account.uid}><td>{account.name}</td><td>{account.email || 'No email on file'}</td><td>{account.role}</td><td>{account.active ? 'Active' : 'Disabled'}</td><td className="table-actions"><button className="button" onClick={() => { setEditingStaffId(account.uid); setStaffForm({ name: account.name, email: account.email, password: '', role: account.role }) }}>Edit</button><button className="button" disabled={busyOperation === 'staff-status'} onClick={() => toggleStaff(account)}>{account.active ? 'Disable' : 'Enable'}</button><button className="button" disabled={busyOperation === 'staff-reset'} onClick={() => resetStaff(account)}>Reset password</button><button className="button danger" disabled={busyOperation === 'staff-delete'} onClick={() => removeStaff(account)}>Delete</button></td></tr>)}</tbody></table></div>}
      </section>}

      {confirmation && <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title"><h3 id="confirmation-title">{confirmation.title}</h3><p>{confirmation.description}</p><div className="form-actions"><button className="button danger" disabled={Boolean(busyOperation)} onClick={async () => { const action = confirmation.action; setConfirmation(null); await action() }}>{confirmation.confirmLabel}</button><button className="button" onClick={() => setConfirmation(null)}>Cancel</button></div></section>}
    </div>
  )
}
