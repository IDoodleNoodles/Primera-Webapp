import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { firebaseConfigured } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { getMockAdminDashboard, getMockStaffAccounts } from '../data/mockPortalData'
import {
  assignPatient,
  createPatient,
  createStaffAccount,
  deletePatient,
  deleteStaffAccount,
  fetchAdminDashboardData,
  fetchStaffAccounts,
  getEmptyAdminDashboard,
  setStaffAccountStatus,
  updatePatient,
  updateStaffAccount,
} from '../services/portalService'
import type { AdminDashboardData, PatientInput, StaffAccount } from '../services/portalService'
import type { Patient } from '../types'

const emptyPatient: PatientInput = {
  name: '', assignedDoctorId: null, riskLevel: 'low', riskScore: 0, status: 'stable',
  symptoms: 0, vitals: { heartRate: 0, oxygen: 0, bloodPressure: 0, temperature: 0 },
}

const emptyStaff = { name: '', email: '', password: '', role: 'doctor' as 'admin' | 'doctor' }

function adminSection(pathname: string) {
  if (pathname.includes('/patients')) return 'patients'
  if (pathname.includes('/assignments')) return 'assignments'
  if (pathname.includes('/logs')) return 'logs'
  return 'overview'
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
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const visibleStaff = staff.filter((account) => account.role !== 'admin')
  const writesDisabled = demoMode || busy

  useEffect(() => {
    if (user?.role !== 'admin') {
      return
    }

    if (demoMode) {
      setDashboard(getMockAdminDashboard())
      setLoading(false)
      return
    }

    fetchAdminDashboardData(user.uid)
      .then(setDashboard)
      .catch(() => {
        setDashboard(getEmptyAdminDashboard())
        setError('Unable to load live operations data.')
      })
      .finally(() => setLoading(false))
  }, [user, demoMode])

  useEffect(() => {
    if (demoMode) {
      setStaff(getMockStaffAccounts())
      return
    }
    fetchStaffAccounts().then(setStaff).catch(() => setError('Unable to load staff accounts.'))
  }, [demoMode])

  function showError(value: unknown) {
    setMessage('')
    setError(value instanceof Error ? value.message : 'The operation could not be completed.')
  }

  async function refreshAdminDashboard() {
    if (user?.role !== 'admin' || demoMode) return
    const refreshed = await fetchAdminDashboardData(user.uid)
    setDashboard(refreshed)
  }

  async function savePatient(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      const saved = editingPatientId
        ? await updatePatient(editingPatientId, patientForm)
        : await createPatient(patientForm)
      await assignPatient(saved.id, patientForm.assignedDoctorId)
      await refreshAdminDashboard()
      setPatientForm(emptyPatient); setEditingPatientId(null); setMessage('Patient record saved.')
    } catch (operationError) { showError(operationError) } finally { setBusy(false) }
  }

  async function removePatient(patient: Patient) {
    if (!window.confirm(`Delete ${patient.name}'s patient record?`)) return
    setBusy(true); setError('')
    try {
      await deletePatient(patient.id)
      await refreshAdminDashboard()
      setMessage('Patient record deleted.')
    } catch (operationError) { showError(operationError) } finally { setBusy(false) }
  }

  async function saveStaff(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try {
      if (editingStaffId) {
        await updateStaffAccount({ uid: editingStaffId, name: staffForm.name, role: staffForm.role })
        setStaff((current) => current.map((item) => item.uid === editingStaffId ? { ...item, name: staffForm.name, role: staffForm.role } : item))
      } else {
        const result = await createStaffAccount(staffForm)
        setStaff((current) => [...current, { uid: result.uid, name: staffForm.name, email: staffForm.email, role: staffForm.role, active: true }])
      }
      await refreshAdminDashboard()
      setStaffForm(emptyStaff); setEditingStaffId(null); setMessage('Staff account saved.')
    } catch (operationError) { showError(operationError) } finally { setBusy(false) }
  }

  async function toggleStaff(account: StaffAccount) {
    setBusy(true); setError('')
    try {
      await setStaffAccountStatus(account.uid, !account.active)
      setStaff((current) => current.map((item) => item.uid === account.uid ? { ...item, active: !item.active } : item))
      await refreshAdminDashboard()
      setMessage(`Account ${account.active ? 'disabled' : 'enabled'}.`)
    } catch (operationError) { showError(operationError) } finally { setBusy(false) }
  }

  async function removeStaff(account: StaffAccount) {
    if (!window.confirm(`Delete ${account.name}'s staff account?`)) return
    setBusy(true); setError('')
    try {
      await deleteStaffAccount(account.uid)
      setStaff((current) => current.filter((item) => item.uid !== account.uid))
      await refreshAdminDashboard()
      setMessage('Staff account deleted.')
    } catch (operationError) { showError(operationError) } finally { setBusy(false) }
  }

  async function unassignPatient(patient: Patient) {
    setBusy(true)
    setError('')
    try {
      await assignPatient(patient.id, null)
      await refreshAdminDashboard()
      setMessage('Patient unassigned successfully.')
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusy(false)
    }
  }

  function startPatientEdit(patient: Patient) {
    setEditingPatientId(patient.id)
    setPatientForm({ name: patient.name, assignedDoctorId: patient.assignedDoctorId, riskLevel: patient.riskLevel, riskScore: patient.riskScore, status: patient.status, symptoms: patient.symptoms, vitals: patient.vitals })
  }

  if (loading || !dashboard) {
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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h2>
            {section === 'patients' && 'Patient registry'}
            {section === 'assignments' && 'Assignment board'}
            {section === 'logs' && 'Audit trail'}
            {section === 'overview' && 'Maternal care operations overview'}
          </h2>
        </div>
      </header>

      {demoMode && <p className="form-message">Prototype data is shown because Firebase is not configured. Writes are disabled.</p>}
      {message && <p className="form-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      {section === 'patients' && (
      <section className="panel admin-management">
        <div className="panel-heading"><div><p className="eyebrow">Patient registry</p><h3>{editingPatientId ? 'Edit patient record' : 'Add patient record'}</h3></div></div>
        <form className="admin-form" onSubmit={savePatient}>
          <label>Name<input required value={patientForm.name} onChange={(event) => setPatientForm({ ...patientForm, name: event.target.value })} /></label>
          <label>Risk level<select value={patientForm.riskLevel} onChange={(event) => setPatientForm({ ...patientForm, riskLevel: event.target.value as PatientInput['riskLevel'] })}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label>Risk score<input type="number" min="0" max="100" value={patientForm.riskScore} onChange={(event) => setPatientForm({ ...patientForm, riskScore: Number(event.target.value) })} /></label>
          <label>Status<select value={patientForm.status} onChange={(event) => setPatientForm({ ...patientForm, status: event.target.value as PatientInput['status'] })}><option value="stable">Stable</option><option value="monitoring">Monitoring</option><option value="escalated">Escalated</option></select></label>
          <label>Assigned doctor<select value={patientForm.assignedDoctorId ?? ''} onChange={(event) => setPatientForm({ ...patientForm, assignedDoctorId: event.target.value || null })}><option value="">Unassigned</option>{staff.filter((account) => account.role === 'doctor' && account.active).map((doctor) => <option key={doctor.uid} value={doctor.uid}>{doctor.name}</option>)}</select></label>
          <div className="form-actions"><button className="button primary" disabled={writesDisabled}>{editingPatientId ? 'Update patient' : 'Create patient'}</button>{editingPatientId && <button type="button" className="button" onClick={() => { setEditingPatientId(null); setPatientForm(emptyPatient) }}>Cancel</button>}</div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Patient</th><th>Risk</th><th>Status</th><th>Doctor</th><th>Actions</th></tr></thead><tbody>{dashboard.patients.map((patient) => <tr key={patient.id}><td>{patient.name}</td><td><span className={`risk-badge ${patient.riskLevel}`}>{patient.riskLevel}</span></td><td>{patient.status}</td><td>{staff.find((account) => account.uid === patient.assignedDoctorId)?.name ?? 'Unassigned'}</td><td className="table-actions"><button className="button" disabled={demoMode} onClick={() => startPatientEdit(patient)}>Edit</button><button className="button danger" disabled={demoMode} onClick={() => removePatient(patient)}>Delete</button>{patient.assignedDoctorId && <button className="button" disabled={demoMode} onClick={() => unassignPatient(patient)}>Unassign</button>}</td></tr>)}</tbody></table></div>
      </section>
      )}

      {section === 'overview' && (
      <>
      <section className="panel admin-management">
        <div className="panel-heading"><div><p className="eyebrow">Staff access</p><h3>{editingStaffId ? 'Edit staff account' : 'Create staff account'}</h3></div></div>
        <form className="admin-form" onSubmit={saveStaff}>
          <label>Name<input required value={staffForm.name} onChange={(event) => setStaffForm({ ...staffForm, name: event.target.value })} /></label>
          {!editingStaffId && <label>Email<input required type="email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} /></label>}
          {!editingStaffId && <label>Temporary password<input required type="password" minLength={6} value={staffForm.password} onChange={(event) => setStaffForm({ ...staffForm, password: event.target.value })} /></label>}
          <label>Role<select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value as 'admin' | 'doctor' })}><option value="doctor">Doctor</option><option value="admin">Admin</option></select></label>
          <div className="form-actions"><button className="button primary" disabled={writesDisabled}>{editingStaffId ? 'Update account' : 'Create account'}</button>{editingStaffId && <button type="button" className="button" onClick={() => { setEditingStaffId(null); setStaffForm(emptyStaff) }}>Cancel</button>}</div>
        </form>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleStaff.map((account) => <tr key={account.uid}><td>{account.name}</td><td>{account.email || 'No email on file'}</td><td>{account.role}</td><td>{account.active ? 'Active' : 'Disabled'}</td><td className="table-actions"><button className="button" disabled={demoMode} onClick={() => { setEditingStaffId(account.uid); setStaffForm({ name: account.name, email: account.email, password: '', role: account.role }) }}>Edit</button><button className="button" disabled={demoMode} onClick={() => toggleStaff(account)}>{account.active ? 'Disable' : 'Enable'}</button><button className="button danger" disabled={demoMode} onClick={() => removeStaff(account)}>Delete</button></td></tr>)}</tbody></table></div>
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

      <section className="two-column">
        <div className="panel">
          <h3>Risk distribution</h3>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dashboard.riskDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <h3>Patients requiring review</h3>
          <ul className="list">
            {dashboard.reviewPatients.map((patient) => (
                <li key={patient.id}>
                  <span>{patient.name}</span>
                  <strong>{patient.riskLevel}</strong>
                </li>
              ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <h3>Operational summary</h3>
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
          <div>
            <span>Avg risk score</span>
            <strong>{dashboard.overview.averageRisk}</strong>
          </div>
        </div>
      </section>
      </>
      )}

      {section === 'assignments' && (
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Assignments</p><h3>Doctor-to-patient coverage</h3></div></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Patient</th><th>Risk</th><th>Doctor</th><th>Actions</th></tr></thead><tbody>{dashboard.patients.map((patient) => <tr key={patient.id}><td>{patient.name}</td><td><span className={`risk-badge ${patient.riskLevel}`}>{patient.riskLevel}</span></td><td>{staff.find((account) => account.uid === patient.assignedDoctorId)?.name ?? 'Unassigned'}</td><td className="table-actions">{patient.assignedDoctorId && <button className="button" disabled={demoMode} onClick={() => unassignPatient(patient)}>Unassign</button>}</td></tr>)}</tbody></table></div>
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
    </div>
  )
}
