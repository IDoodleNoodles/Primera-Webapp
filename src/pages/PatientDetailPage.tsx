import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { firebaseConfigured } from '../firebase'
import { getMockDoctorAlerts, getMockPatientForDoctor } from '../data/mockPortalData'
import {
  createDoctorAlert,
  deleteDoctorAlert,
  fetchDoctorAlertsForPatient,
  fetchPatientByIdForDoctor,
  updateDoctorAlert,
  updatePatientForDoctor,
} from '../services/portalService'
import { useAuth } from '../context/AuthContext'
import type { DoctorAlert, Patient } from '../types'

const emptyAlert = { title: '', details: '', status: 'active' as 'active' | 'resolved' }

export function PatientDetailPage() {
  const { patientId } = useParams()
  const { user } = useAuth()
  const demoMode = !firebaseConfigured
  const [patient, setPatient] = useState<Patient | null>(null)
  const [alerts, setAlerts] = useState<DoctorAlert[]>([])
  const [patientForm, setPatientForm] = useState<Pick<Patient, 'riskLevel' | 'riskScore' | 'status' | 'symptoms' | 'vitals'> | null>(null)
  const [alertForm, setAlertForm] = useState(emptyAlert)
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || user.role !== 'doctor' || !patientId) {
      Promise.resolve(null).then(setPatient).finally(() => setLoading(false))
      return
    }

    if (demoMode) {
      const result = getMockPatientForDoctor(user.uid, patientId)
      setPatient(result)
      setPatientForm(result ? {
        riskLevel: result.riskLevel,
        riskScore: result.riskScore,
        status: result.status,
        symptoms: result.symptoms,
        vitals: result.vitals,
      } : null)
      setAlerts(getMockDoctorAlerts(user.uid, patientId))
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.allSettled([
      fetchPatientByIdForDoctor(user.uid, patientId),
      fetchDoctorAlertsForPatient(user.uid, patientId),
    ])
      .then(([patientResult, alertsResult]) => {
        const result = patientResult.status === 'fulfilled' ? patientResult.value : null
        setPatient(result)
        setPatientForm(result ? {
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
          status: result.status,
          symptoms: result.symptoms,
          vitals: result.vitals,
        } : null)
        setAlerts(alertsResult.status === 'fulfilled' ? alertsResult.value : [])
      })
      .finally(() => setLoading(false))
  }, [user, patientId, demoMode])

  function showError(value: unknown) {
    setMessage('')
    setError(value instanceof Error ? value.message : 'The operation could not be completed.')
  }

  async function saveClinicalSnapshot(event: React.FormEvent) {
    event.preventDefault()
    if (!user || user.role !== 'doctor' || !patientId || !patientForm) return

    setBusy(true)
    setMessage('')
    setError('')

    try {
      await updatePatientForDoctor(user.uid, patientId, patientForm)
      const refreshed = await fetchPatientByIdForDoctor(user.uid, patientId)
      setPatient(refreshed)
      if (refreshed) {
        setPatientForm({
          riskLevel: refreshed.riskLevel,
          riskScore: refreshed.riskScore,
          status: refreshed.status,
          symptoms: refreshed.symptoms,
          vitals: refreshed.vitals,
        })
      }
      setMessage('Clinical snapshot updated.')
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusy(false)
    }
  }

  async function saveAlert(event: React.FormEvent) {
    event.preventDefault()
    if (!user || user.role !== 'doctor' || !patientId) return

    setBusy(true)
    setMessage('')
    setError('')

    try {
      if (editingAlertId) {
        await updateDoctorAlert(editingAlertId, alertForm)
      } else {
        await createDoctorAlert(user.uid, patientId, alertForm)
      }

      const refreshed = await fetchDoctorAlertsForPatient(user.uid, patientId)
      setAlerts(refreshed)
      setAlertForm(emptyAlert)
      setEditingAlertId(null)
      setMessage('Alert saved.')
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusy(false)
    }
  }

  async function removeAlert(alertId: string) {
    if (!user || user.role !== 'doctor' || !patientId) return
    if (!window.confirm('Delete this alert?')) return

    setBusy(true)
    setMessage('')
    setError('')

    try {
      await deleteDoctorAlert(alertId)
      const refreshed = await fetchDoctorAlertsForPatient(user.uid, patientId)
      setAlerts(refreshed)
      setMessage('Alert deleted.')
    } catch (operationError) {
      showError(operationError)
    } finally {
      setBusy(false)
    }
  }

  function startAlertEdit(alert: DoctorAlert) {
    setEditingAlertId(alert.id)
    setAlertForm({ title: alert.title, details: alert.details, status: alert.status })
  }

  if (loading) {
    return (
      <div className="page">
        <section className="panel">
          <p className="eyebrow">Loading</p>
          <h2>Fetching patient record</h2>
        </section>
      </div>
    )
  }

  if (!patient) {
    return (
      <div className="page">
        <section className="panel">
          <p className="eyebrow">Access restricted</p>
          <h2>Patient record unavailable</h2>
          <p className="muted">This OBGYN portal only displays records assigned to the signed-in clinician.</p>
        </section>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Patient detail</p>
          <h2>{patient.name}</h2>
        </div>
      </header>

      {demoMode && <p className="form-message">Prototype data is shown because Firebase is not configured. Writes are disabled.</p>}
      {message && <p className="form-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="detail-grid">
        <div className="panel">
          <h3>Clinical snapshot</h3>
          <div className="detail-list">
            <div><span>Risk level</span><strong>{patient.riskLevel}</strong></div>
            <div><span>Risk score</span><strong>{patient.riskScore}</strong></div>
            <div><span>Symptoms</span><strong>{patient.symptoms}</strong></div>
            <div><span>Heart rate</span><strong>{patient.vitals.heartRate} bpm</strong></div>
            <div><span>Oxygen</span><strong>{patient.vitals.oxygen}%</strong></div>
            <div><span>Blood pressure</span><strong>{patient.vitals.bloodPressure}</strong></div>
          </div>

          {patientForm ? (
            <form className="admin-form" onSubmit={saveClinicalSnapshot}>
              <label>Risk level<select value={patientForm.riskLevel} onChange={(event) => setPatientForm({ ...patientForm, riskLevel: event.target.value as Patient['riskLevel'] })}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option><option value="critical">Critical</option></select></label>
              <label>Risk score<input type="number" min="0" max="100" value={patientForm.riskScore} onChange={(event) => setPatientForm({ ...patientForm, riskScore: Number(event.target.value) })} /></label>
              <label>Status<select value={patientForm.status} onChange={(event) => setPatientForm({ ...patientForm, status: event.target.value as Patient['status'] })}><option value="stable">Stable</option><option value="monitoring">Monitoring</option><option value="escalated">Escalated</option></select></label>
              <label>Symptoms<input type="number" min="0" max="10" value={patientForm.symptoms} onChange={(event) => setPatientForm({ ...patientForm, symptoms: Number(event.target.value) })} /></label>
              <label>Heart rate<input type="number" min="0" value={patientForm.vitals.heartRate} onChange={(event) => setPatientForm({ ...patientForm, vitals: { ...patientForm.vitals, heartRate: Number(event.target.value) } })} /></label>
              <label>Oxygen<input type="number" min="0" max="100" value={patientForm.vitals.oxygen} onChange={(event) => setPatientForm({ ...patientForm, vitals: { ...patientForm.vitals, oxygen: Number(event.target.value) } })} /></label>
              <label>Blood pressure<input type="number" min="0" value={patientForm.vitals.bloodPressure} onChange={(event) => setPatientForm({ ...patientForm, vitals: { ...patientForm.vitals, bloodPressure: Number(event.target.value) } })} /></label>
              <label>Temperature<input type="number" step="0.1" value={patientForm.vitals.temperature} onChange={(event) => setPatientForm({ ...patientForm, vitals: { ...patientForm.vitals, temperature: Number(event.target.value) } })} /></label>
              <div className="form-actions"><button className="button primary" disabled={busy || demoMode}>Update snapshot</button></div>
            </form>
          ) : null}
        </div>

        <div className="panel">
          <h3>Clinical alerts</h3>
          <form className="admin-form" onSubmit={saveAlert}>
            <label>Title<input required value={alertForm.title} onChange={(event) => setAlertForm({ ...alertForm, title: event.target.value })} /></label>
            <label>Status<select value={alertForm.status} onChange={(event) => setAlertForm({ ...alertForm, status: event.target.value as 'active' | 'resolved' })}><option value="active">Active</option><option value="resolved">Resolved</option></select></label>
            <label style={{ gridColumn: '1 / -1' }}>Details<textarea rows={3} value={alertForm.details} onChange={(event) => setAlertForm({ ...alertForm, details: event.target.value })} /></label>
            <div className="form-actions"><button className="button primary" disabled={busy || demoMode}>{editingAlertId ? 'Update alert' : 'Create alert'}</button>{editingAlertId && <button type="button" className="button" onClick={() => { setEditingAlertId(null); setAlertForm(emptyAlert) }}>Cancel</button>}</div>
          </form>
          <ul className="list">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <div>
                  <strong>{alert.title}</strong>
                  <span>{alert.details || 'No details provided.'}</span>
                  <span className="muted">{alert.status} {alert.createdAt ? `- ${new Date(alert.createdAt).toLocaleDateString()}` : ''}</span>
                </div>
                <div className="table-actions">
                  <button className="button" disabled={demoMode} onClick={() => startAlertEdit(alert)}>Edit</button>
                  <button className="button danger" disabled={demoMode} onClick={() => removeAlert(alert.id)}>Delete</button>
                </div>
              </li>
            ))}
            {!alerts.length && <li><span className="muted">No alerts for this patient yet.</span></li>}
          </ul>
        </div>
      </section>
    </div>
  )
}
