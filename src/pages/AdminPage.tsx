import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { firebaseConfigured } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { getMockAdminDashboard, getMockStaffAccounts } from '../data/mockPortalData'
import { adminSection } from './adminSection'
import {
  assignPatient,
  createPatient,
  createStaffAccount,
  deletePatient,
  deleteStaffAccount,
  fetchAdminDashboardData,
  fetchStaffAccounts,
  setStaffAccountStatus,
  updatePatient,
  updateDoctorName,
  updateStaffAccount,
} from '../services/portalService'
import type { AdminDashboardData, AdminPatient, PatientInput, StaffAccount } from '../services/portalService'

const emptyPatient: PatientInput = {
  name: '', assignedDoctorId: null, active: true, activationStatus: 'pending',
}

const emptyStaff = { name: '', email: '', password: '', role: 'doctor' as 'admin' | 'doctor' }
type Operation = 'patient-save' | 'patient-delete' | 'patient-assign' | 'staff-save' | 'staff-status' | 'staff-delete'
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
  const [patientForm, setPatientForm] = useState<PatientInput>(emptyPatient)
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null)
  const [staffForm, setStaffForm] = useState(emptyStaff)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [busyOperation, setBusyOperation] = useState<Operation | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [staffLoading, setStaffLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')
  const [staffError, setStaffError] = useState('')
  const [dashboardRetry, setDashboardRetry] = useState(0)
  const [staffRetry, setStaffRetry] = useState(0)
  const [patientSearch, setPatientSearch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const visibleStaff = section === 'doctors' ? staff.filter((account) => account.role === 'doctor') : staff
  const isBusy = (operation: Operation) => demoMode || busyOperation === operation

  useEffect(() => {
    if (user?.role !== 'admin') {
      return
    }

    setDashboardLoading(true)
    setDashboardError('')
    if (demoMode) {
      Promise.resolve(getMockAdminDashboard()).then((nextDashboard) => {
        setDashboard(nextDashboard)
      }).catch(() => setDashboardError('Unable to load prototype operations data.'))
        .finally(() => setDashboardLoading(false))
      return
    }

    fetchAdminDashboardData(user.uid, patientSearch)
      .then(setDashboard)
      .catch(() => setDashboardError('Unable to load live operations data.'))
      .finally(() => setDashboardLoading(false))
  }, [user, demoMode, patientSearch, dashboardRetry])

  useEffect(() => {
    setStaffLoading(true)
    setStaffError('')
    if (demoMode) {
      Promise.resolve(getMockStaffAccounts()).then(setStaff)
        .catch(() => setStaffError('Unable to load prototype staff accounts.'))
        .finally(() => setStaffLoading(false))
      return
    }
    fetchStaffAccounts(staffSearch)
      .then(setStaff)
      .catch(() => setStaffError('Unable to load staff accounts.'))
      .finally(() => setStaffLoading(false))
  }, [demoMode, staffSearch, staffRetry])

  function showError(value: unknown) {
    setMessage('')
    setError(value instanceof Error ? value.message : 'The operation could not be completed.')
  }

  async function refreshAdminDashboard() {
    if (user?.role !== 'admin' || demoMode) return
    const refreshed = await fetchAdminDashboardData(user.uid, patientSearch)
    setDashboard(refreshed)
  }

  async function savePatient(event: React.FormEvent) {
    event.preventDefault()
    const name = patientForm.name.trim()
    if (name.length < 2) {
      setError('Enter a patient name with at least 2 characters.')
      return
    }
    setBusyOperation('patient-save'); setError(''); setMessage('')
    try {
      const input = { ...patientForm, name }
      const saved = editingPatientId
        ? await updatePatient(editingPatientId, input)
        : await createPatient(input)
      await assignPatient(saved.id, input.assignedDoctorId)
      await refreshAdminDashboard()
      setPatientForm(emptyPatient); setEditingPatientId(null); setMessage(editingPatientId ? 'Patient record updated.' : 'Patient record created and queued for activation.')
    } catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
  }

  async function removePatient(patient: AdminPatient) {
    setConfirmation({
      title: `Delete ${patient.name}'s patient record?`,
      description: 'This permanently removes the patient profile, assignments, alerts, check-ins, and related activity.',
      confirmLabel: 'Delete patient',
      action: async () => {
        setBusyOperation('patient-delete'); setError('')
        try {
          await deletePatient(patient.id)
          await refreshAdminDashboard()
          setMessage('Patient record deleted.')
        } catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
      },
    })
  }

  async function activatePatient(patient: AdminPatient) {
    setBusyOperation('patient-save'); setError('')
    try {
      await updatePatient(patient.id, { name: patient.name, assignedDoctorId: patient.assignedDoctorId, active: patient.active, activationStatus: 'active' })
      await refreshAdminDashboard()
      setMessage('Patient onboarding activated.')
    } catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
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
      const staffRole = section === 'doctors' ? 'doctor' : staffForm.role
      if (editingStaffId) {
        if (section === 'doctors') {
          await updateDoctorName(editingStaffId, name)
        } else {
          await updateStaffAccount({ uid: editingStaffId, name, role: staffRole })
        }
        setStaff((current) => current.map((item) => item.uid === editingStaffId ? { ...item, name, role: staffRole } : item))
      } else {
        const result = await createStaffAccount({ ...staffForm, name, email: staffForm.email.trim(), role: staffRole })
        setStaff((current) => [...current, { uid: result.uid, name, email: staffForm.email.trim(), role: staffRole, active: true }])
      }
      await refreshAdminDashboard()
      setStaffForm(emptyStaff); setEditingStaffId(null); setMessage('Staff account saved.')
    } catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
  }

  async function toggleStaff(account: StaffAccount) {
    setBusyOperation('staff-status'); setError('')
    try {
      await setStaffAccountStatus(account.uid, !account.active)
      setStaff((current) => current.map((item) => item.uid === account.uid ? { ...item, active: !item.active } : item))
      await refreshAdminDashboard()
      setMessage(`Account ${account.active ? 'disabled' : 'enabled'}.`)
    } catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
  }

  async function removeStaff(account: StaffAccount) {
    setConfirmation({
      title: `Delete ${account.name}'s staff account?`,
      description: 'This permanently removes their portal access and staff profile. This action cannot be undone.',
      confirmLabel: 'Delete account',
      action: async () => {
        setBusyOperation('staff-delete'); setError('')
        try {
          await deleteStaffAccount(account.uid)
          setStaff((current) => current.filter((item) => item.uid !== account.uid))
          await refreshAdminDashboard()
          setMessage('Staff account deleted.')
        } catch (operationError) { showError(operationError) } finally { setBusyOperation(null) }
      },
    })
  }

  async function unassignPatient(patient: AdminPatient) {
    setBusyOperation('patient-assign')
    setError('')
    try {
      await assignPatient(patient.id, null)
      await refreshAdminDashboard()
      setMessage('Patient unassigned successfully.')
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusyOperation(null)
    }
  }

  function startPatientEdit(patient: AdminPatient) {
    setEditingPatientId(patient.id)
    setPatientForm({ name: patient.name, assignedDoctorId: patient.assignedDoctorId, active: patient.active, activationStatus: patient.activationStatus })
  }

  if (dashboardLoading && !dashboard) {
    return (
      <div className="page">
        <section className="panel">
          <p className="eyebrow">Loading</p>
          <h2>Fetching operations data</h2>
          <p className="muted">Gathering real-time dashboard metrics from Firebase.</p>
        </section>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="page">
        <section className="panel">
          <p className="eyebrow">Operations unavailable</p>
          <h2>We could not load the admin dashboard</h2>
          <p className="muted">{dashboardError || 'Try again to reconnect to the operations data.'}</p>
          <button className="button primary" type="button" onClick={() => setDashboardRetry((value) => value + 1)}>Retry dashboard</button>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h2>
            {section === 'patients' && 'Patient registry'}
            {section === 'doctors' && 'Doctor registry'}
            {section === 'assignments' && 'Assignment board'}
            {section === 'logs' && 'Audit trail'}
            {section === 'overview' && 'Maternal care operations overview'}
          </h2>
        </div>
      </header>

      {demoMode && <p className="form-message">Prototype data is shown because Firebase is not configured. Writes are disabled.</p>}
      {message && <p className="form-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}
      {dashboardError && <p className="form-error">{dashboardError} <button className="button" type="button" onClick={() => setDashboardRetry((value) => value + 1)}>Retry dashboard</button></p>}
      {staffError && <p className="form-error">{staffError} <button className="button" type="button" onClick={() => setStaffRetry((value) => value + 1)}>Retry staff accounts</button></p>}
      {dashboardLoading && <p className="muted">Refreshing dashboard data...</p>}
      {staffLoading && <p className="muted">Loading staff accounts...</p>}

      {section === 'patients' && (
      <section className="panel admin-management">
        <div className="panel-heading"><div><p className="eyebrow">Patient registry</p><h3>{editingPatientId ? 'Edit patient record' : 'Add patient record'}</h3></div></div>
        <p className="muted">Patients may use Primera without a linked doctor. A patient-requested link becomes visible to the selected doctor for acceptance; admin assignments and reassignments take effect immediately.</p>
        <label>Search patients<input type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search by name" /></label>
        <form className="admin-form" onSubmit={savePatient}>
          <label>Name<input required minLength={2} value={patientForm.name} onChange={(event) => setPatientForm({ ...patientForm, name: event.target.value })} /></label>
          <label>Assigned doctor<select value={patientForm.assignedDoctorId ?? ''} onChange={(event) => setPatientForm({ ...patientForm, assignedDoctorId: event.target.value || null })}><option value="">Unassigned</option>{staff.filter((account) => account.role === 'doctor' && account.active).map((doctor) => <option key={doctor.uid} value={doctor.uid}>{doctor.name}</option>)}</select></label>
          <label>Account status<select value={patientForm.active ? 'active' : 'inactive'} onChange={(event) => setPatientForm({ ...patientForm, active: event.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div className="form-actions"><button className="button primary" disabled={isBusy('patient-save')}>{isBusy('patient-save') ? 'Saving...' : editingPatientId ? 'Update patient' : 'Create patient'}</button>{editingPatientId && <button type="button" className="button" onClick={() => { setEditingPatientId(null); setPatientForm(emptyPatient) }}>Cancel</button>}</div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Patient account</th><th>Account status</th><th>Onboarding</th><th>Assigned doctor</th><th>Actions</th></tr></thead><tbody>{dashboard.patients.map((patient) => <tr key={patient.id}><td>{patient.name}</td><td>{patient.active ? 'Active' : 'Inactive'}</td><td>{patient.activationStatus === 'pending' ? 'Pending activation' : 'Active'}</td><td>{staff.find((account) => account.uid === patient.assignedDoctorId)?.name ?? 'Unassigned'}</td><td className="table-actions"><button className="button" disabled={demoMode} onClick={() => startPatientEdit(patient)}>Edit</button>{patient.activationStatus === 'pending' && <button className="button" disabled={isBusy('patient-save')} onClick={() => activatePatient(patient)}>Activate</button>}<button className="button danger" disabled={isBusy('patient-delete')} onClick={() => removePatient(patient)}>Delete</button>{patient.assignedDoctorId && <button className="button" disabled={isBusy('patient-assign')} onClick={() => unassignPatient(patient)}>Unassign</button>}</td></tr>)}</tbody></table></div>
      </section>
      )}

      {(section === 'overview' || section === 'doctors') && (
      <>
      <section className="panel admin-management">
        <div className="panel-heading"><div><p className="eyebrow">{section === 'doctors' ? 'Doctor registry' : 'Staff access'}</p><h3>{editingStaffId ? (section === 'doctors' ? 'Edit doctor record' : 'Edit staff account') : (section === 'doctors' ? 'Add doctor record' : 'Create staff account')}</h3></div></div>
        <form className="admin-form" onSubmit={saveStaff}>
          <label>Name<input required minLength={2} value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} /></label>
          {!editingStaffId && <label>Email<input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} /></label>}
          {!editingStaffId && <label>Temporary password<input required type="password" minLength={8} value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} /></label>}
          {section === 'overview' && <label>Role<select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value as 'admin' | 'doctor' })}><option value="doctor">Doctor</option><option value="admin">Admin</option></select></label>}
          <div className="form-actions"><button className="button primary" disabled={isBusy('staff-save')}>{isBusy('staff-save') ? 'Saving...' : editingStaffId ? (section === 'doctors' ? 'Update doctor' : 'Update account') : (section === 'doctors' ? 'Create doctor' : 'Create account')}</button>{editingStaffId && <button type="button" className="button" onClick={() => { setEditingStaffId(null); setStaffForm(emptyStaff) }}>Cancel</button>}</div>
        </form>
        <label>Search {section === 'doctors' ? 'doctors' : 'staff'}<input type="search" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} placeholder="Search by name" /></label>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{section === 'doctors' ? 'Doctor name' : 'Name'}</th><th>Email</th><th>{section === 'doctors' ? 'Specialty' : 'Role'}</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleStaff.map((account) => <tr key={account.uid}><td>{account.name}</td><td>{account.email || 'No email on file'}</td><td>{section === 'doctors' ? (account.specialty || 'OBGYN') : account.role}</td><td>{account.active ? 'Active' : 'Disabled'}</td><td className="table-actions"><button className="button" disabled={demoMode} onClick={() => { setEditingStaffId(account.uid); setStaffForm({ name: account.name, email: account.email, password: '', role: account.role }) }}>Edit</button><button className="button" disabled={isBusy('staff-status')} onClick={() => toggleStaff(account)}>{account.active ? 'Disable' : 'Enable'}</button><button className="button danger" disabled={isBusy('staff-delete')} onClick={() => removeStaff(account)}>Delete</button></td></tr>)}</tbody></table></div>
      </section>

      <section className="metric-grid">
        {dashboard.metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <p>{metric.label}</p>
            <h3>{metric.value}</h3>
            <span>{metric.change}</span>
          </article>
        ))}
      </section>

      <section className="panel">
        <h3>Account and coverage summary</h3>
        <div className="summary-grid">
          <div>
            <span>Total cases</span>
            <strong>{dashboard.overview.totalCases}</strong>
          </div>
          <div>
            <span>Assigned</span>
            <strong>{dashboard.overview.totalAssigned}</strong>
          </div>
          <div>
            <span>Unassigned</span>
            <strong>{dashboard.overview.unassigned}</strong>
          </div>
        </div>
      </section>
      </>
      )}

      {section === 'assignments' && (
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Assignments</p><h3>Doctor-to-patient coverage</h3></div></div>
        <p className="muted">Use this board for admin overrides and reassignment. Patient requests are accepted by the requested doctor from their assigned-patient workspace.</p>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Patient account</th><th>Doctor</th><th>Actions</th></tr></thead><tbody>{dashboard.patients.map((patient) => <tr key={patient.id}><td>{patient.name}</td><td>{staff.find((account) => account.uid === patient.assignedDoctorId)?.name ?? 'Unassigned'}</td><td className="table-actions">{patient.assignedDoctorId && <button className="button" disabled={isBusy('patient-assign')} onClick={() => unassignPatient(patient)}>Unassign</button>}</td></tr>)}</tbody></table></div>
      </section>
      )}

      {(section === 'overview' || section === 'logs') && (
      <section className="panel">
        <h3>Recent audit log</h3>
        <ul className="log-list">
          {dashboard.activityLog.length ? dashboard.activityLog.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.actorName}</strong>
                <span>{entry.action}</span>
              </div>
              <time>{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'N/A'}</time>
            </li>
          )) : <li><span className="muted">No audit events yet. Portal writes do not currently call the audit log function.</span></li>}
        </ul>
      </section>
      )}
      {confirmation && (
        <div className="confirmation-backdrop" role="presentation">
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title">
            <p className="eyebrow">Confirm action</p>
            <h3 id="confirmation-title">{confirmation.title}</h3>
            <p className="muted">{confirmation.description}</p>
            <div className="form-actions">
              <button className="button" type="button" onClick={() => setConfirmation(null)} disabled={busyOperation !== null}>Cancel</button>
              <button className="button danger" type="button" onClick={async () => { const action = confirmation.action; setConfirmation(null); await action() }} disabled={busyOperation !== null}>{confirmation.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
