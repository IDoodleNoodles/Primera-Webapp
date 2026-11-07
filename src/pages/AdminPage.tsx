import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { firebaseConfigured } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { adminSection } from './adminSection'
import {
  createStaffAccount,
  deleteStaffAccount,
  fetchAdminDashboardData,
  fetchStaffAccounts,
  resetStaffPassword,
  setStaffAccountStatus,
  updateStaffAccount,
} from '../services/portalService'
import type { AdminDashboardData, StaffAccount } from '../services/portalService'

const emptyStaff = { name: '', email: '', password: '', role: 'doctor' as 'admin' | 'doctor' }
type Operation = 'staff-save' | 'staff-status' | 'staff-delete' | 'staff-reset'
type Confirmation = {
  title: string
  description: string
  confirmLabel: string
  action: () => Promise<void>
}

export function AdminPage() {
  const { user } = useAuth()
  const section = adminSection(useLocation().pathname)
  const demoMode = !firebaseConfigured
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
  const [staff, setStaff] = useState<StaffAccount[]>([])
  const [staffForm, setStaffForm] = useState(emptyStaff)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [busyOperation, setBusyOperation] = useState<Operation | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const visibleStaff = section === 'doctors' ? staff.filter((account) => account.role === 'doctor') : staff

  useEffect(() => {
    if (user?.role !== 'admin') return
    Promise.all([
      fetchAdminDashboardData(user.uid),
      fetchStaffAccounts(staffSearch),
    ])
      .then(([nextDashboard, nextStaff]) => {
        setDashboard(nextDashboard)
        setStaff(nextStaff)
      })
      .catch((loadError) => {
        const code = typeof loadError === 'object' && loadError && 'code' in loadError
          ? ` (${String(loadError.code)})`
          : ''
        const detail = loadError instanceof Error ? ` ${loadError.message}` : ''
        setDashboardError(`Unable to load staff operations data${code}.${detail}`)
      })
      .finally(() => setLoading(false))
  }, [user, staffSearch, retry])

  function showError(value: unknown) {
    setMessage('')
    setError(value instanceof Error ? value.message : 'The operation could not be completed.')
  }

  async function saveStaff(event: React.FormEvent) {
    event.preventDefault()
    const name = staffForm.name.trim()
    if (name.length < 2) {
      setError('Enter a staff name with at least 2 characters.')
      return
    }
    if (!editingStaffId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffForm.email.trim())) {
      setError('Enter a valid staff email address.')
      return
    }
    if (!editingStaffId && staffForm.password.length < 8) {
      setError('Temporary passwords must be at least 8 characters.')
      return
    }
    setBusyOperation('staff-save'); setError(''); setMessage('')
    try {
      const role = section === 'doctors' ? 'doctor' : staffForm.role
      if (editingStaffId) {
        await updateStaffAccount({ uid: editingStaffId, name, role })
      } else {
        await createStaffAccount({ ...staffForm, name, email: staffForm.email.trim(), role })
      }
      setStaffForm(emptyStaff)
      setEditingStaffId(null)
      setRetry((value) => value + 1)
      setMessage('Staff account saved.')
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusyOperation(null)
    }
  }

  async function toggleStaff(account: StaffAccount) {
    setBusyOperation('staff-status'); setError('')
    try {
      await setStaffAccountStatus(account.uid, !account.active)
      setStaff((current) => current.map((item) => item.uid === account.uid ? { ...item, active: !item.active } : item))
      setMessage(`Account ${account.active ? 'disabled' : 'enabled'}.`)
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusyOperation(null)
    }
  }

  async function resetStaff(account: StaffAccount) {
    setBusyOperation('staff-reset'); setError('')
    try {
      const result = await resetStaffPassword(account.uid)
      setMessage(`Password reset link issued for ${account.name} (${result.maskedEmail}).`)
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusyOperation(null)
    }
  }

  function removeStaff(account: StaffAccount) {
    setConfirmation({
      title: `Delete ${account.name}'s staff account?`,
      description: 'This permanently removes their portal access and staff profile. This action cannot be undone.',
      confirmLabel: 'Delete account',
      action: async () => {
        setBusyOperation('staff-delete'); setError('')
        try {
          await deleteStaffAccount(account.uid)
          setStaff((current) => current.filter((item) => item.uid !== account.uid))
          setMessage('Staff account deleted.')
        } catch (operationError) {
          showError(operationError)
        } finally {
          setBusyOperation(null)
        }
      },
    })
  }

  if (loading && !dashboard) {
    return <div className="page"><section className="panel"><p className="eyebrow">Loading</p><h2>Fetching staff operations data</h2></section></div>
  }

  if (!dashboard) {
    return <div className="page"><section className="panel"><p className="eyebrow">Operations unavailable</p><h2>We could not load the admin dashboard</h2><p className="muted">{dashboardError}</p><button className="button primary" onClick={() => setRetry((value) => value + 1)}>Retry</button></section></div>
  }

  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">Admin dashboard</p><h2>{section === 'doctors' ? 'Doctor registry' : 'Staff access'}</h2></div></header>
      {demoMode && <p className="form-message">Prototype staff data is shown because Firebase is not configured. Writes are disabled.</p>}
      {message && <p className="form-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}
      {dashboardError && <p className="form-error">{dashboardError} <button className="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}

      <section className="panel admin-management">
        <div className="panel-heading"><div><p className="eyebrow">{section === 'doctors' ? 'Doctor registry' : 'Staff access'}</p><h3>{editingStaffId ? 'Edit staff account' : 'Create staff account'}</h3></div></div>
        <p className="muted">This workspace is limited to staff accounts and system administration. Patient records, clinical data, assignments, requests, risk information, and patient-linked audit details are not available to administrators.</p>
        <form className="admin-form" onSubmit={saveStaff}>
          <label>Name<input required minLength={2} value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} /></label>
          {!editingStaffId && <label>Email<input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} /></label>}
          {!editingStaffId && <label>Temporary password<input required type="password" minLength={8} value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} /></label>}
          {section !== 'doctors' && <label>Role<select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value as 'admin' | 'doctor' })}><option value="doctor">Doctor</option><option value="admin">Admin</option></select></label>}
          <div className="form-actions"><button className="button primary" disabled={demoMode || busyOperation === 'staff-save'}>{busyOperation === 'staff-save' ? 'Saving...' : editingStaffId ? 'Update account' : 'Create account'}</button>{editingStaffId && <button type="button" className="button" onClick={() => { setEditingStaffId(null); setStaffForm(emptyStaff) }}>Cancel</button>}</div>
        </form>
        <label>Search staff<input type="search" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Search by name" /></label>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleStaff.map((account) => <tr key={account.uid}><td>{account.name}</td><td>{account.email || 'No email on file'}</td><td>{account.role}</td><td>{account.active ? 'Active' : 'Disabled'}</td><td className="table-actions"><button className="button" disabled={demoMode} onClick={() => { setEditingStaffId(account.uid); setStaffForm({ name: account.name, email: account.email, password: '', role: account.role }) }}>Edit</button><button className="button" disabled={busyOperation === 'staff-status'} onClick={() => toggleStaff(account)}>{account.active ? 'Disable' : 'Enable'}</button><button className="button" disabled={busyOperation === 'staff-reset'} onClick={() => resetStaff(account)}>Reset password</button><button className="button danger" disabled={busyOperation === 'staff-delete'} onClick={() => removeStaff(account)}>Delete</button></td></tr>)}</tbody></table></div>
      </section>

      <section className="metric-grid">{dashboard.metrics.map((metric) => <article className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.change}</small></article>)}</section>

      {confirmation && <section className="confirmation-dialog" role="alertdialog" aria-modal="true"><h3>{confirmation.title}</h3><p>{confirmation.description}</p><div className="form-actions"><button className="button danger" disabled={Boolean(busyOperation)} onClick={async () => { const action = confirmation.action; setConfirmation(null); await action() }}>{confirmation.confirmLabel}</button><button className="button" onClick={() => setConfirmation(null)}>Cancel</button></div></section>}
    </div>
  )
}
