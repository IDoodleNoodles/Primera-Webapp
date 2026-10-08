import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { firebaseConfigured } from '../firebase'
import { getMockDoctorAlerts, getMockPatientClinicalEvidence, getMockPatientForDoctor } from '../data/mockPortalData'
import {
  createDoctorAlert,
  deleteDoctorAlert,
  fetchDoctorAlertsForPatient,
  fetchPatientClinicalEvidence,
  fetchPatientByIdForDoctor,
  updateDoctorAlert,
  updatePatientForDoctor,
} from '../services/portalService'
import { useAuth } from '../context/AuthContext'
import type { DoctorAlert, Patient, PatientClinicalEvidence } from '../types'

const emptyAlert = { title: '', details: '', status: 'active' as 'active' | 'resolved' }

function reviewLabel(patient: Patient) {
  if (patient.alertCount > 0) return `${patient.alertCount} alert${patient.alertCount === 1 ? '' : 's'}`
  if (patient.unreadNotes > 0) return 'Unread record'
  if (patient.status === 'escalated') return 'Follow-up indicated'
  return 'No review items'
}

export function PatientDetailPage() {
  const { patientId } = useParams()
  const { user } = useAuth()
  const demoMode = !firebaseConfigured
  const [patient, setPatient] = useState<Patient | null>(null)
  const [alerts, setAlerts] = useState<DoctorAlert[]>([])
  const [evidence, setEvidence] = useState<PatientClinicalEvidence | null>(null)
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
      Promise.resolve().then(() => {
        setPatient(result)
        setPatientForm(result ? {
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
          status: result.status,
          symptoms: result.symptoms,
          vitals: result.vitals,
        } : null)
        setAlerts(getMockDoctorAlerts(user.uid, patientId))
        setEvidence(result ? getMockPatientClinicalEvidence(user.uid, patientId) : null)
        setLoading(false)
      })
      return
    }

    Promise.resolve().then(() => setLoading(true))
    Promise.allSettled([
      fetchPatientByIdForDoctor(user.uid, patientId),
      fetchDoctorAlertsForPatient(user.uid, patientId),
      fetchPatientClinicalEvidence(user.uid, patientId),
    ])
      .then(([patientResult, alertsResult, evidenceResult]) => {
        const rejected = [patientResult, alertsResult, evidenceResult].some((result) => result.status === 'rejected')
        if (rejected) setError('Some patient data could not be loaded. Refresh and try again.')
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
        setEvidence(evidenceResult.status === 'fulfilled' ? evidenceResult.value : null)
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

  function applyScreeningSignal() {
    if (!patientForm || !evidence?.screeningSignal.score || !evidence.screeningSignal.level) return
    setPatientForm({
      ...patientForm,
      riskLevel: evidence.screeningSignal.level,
      riskScore: evidence.screeningSignal.score,
    })
  }

  function recordValue(record: PatientClinicalEvidence['checkins'][number], label: string) {
    return record.values.find((value) => value.label.toLowerCase() === label.toLowerCase())?.value ?? 'Not recorded'
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
          <p className="muted">Assigned patient record · Last check-in {patient.lastCheckIn ? new Date(patient.lastCheckIn).toLocaleDateString() : 'not recorded'}</p>
        </div>
      </header>

      {demoMode && <p className="form-message">Prototype data is shown because Firebase is not configured. Writes are disabled.</p>}
      {message && <p className="form-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="summary-grid patient-overview">
        <div><span>Pregnancy progress</span><strong>{patient.pregnancyWeek ? `${patient.pregnancyWeek} weeks` : 'Not recorded'}</strong><small>{patient.trimester ?? 'Trimester not recorded'}</small></div>
        <div><span>Last check-in</span><strong>{patient.lastCheckIn ? new Date(patient.lastCheckIn).toLocaleDateString() : 'Not recorded'}</strong><small>{patient.status}</small></div>
        <div><span>Latest sync</span><strong>{evidence?.smartwatchHealthRecords[0]?.timestamp ? new Date(evidence.smartwatchHealthRecords[0].timestamp).toLocaleDateString() : 'Not available'}</strong><small>Health Connect / wearable</small></div>
        <div><span>Review status</span><strong>{reviewLabel(patient)}</strong><small>{patient.riskLevel} risk profile</small></div>
      </section>

      {(alerts.some((alert) => alert.status === 'active') || patient.status === 'escalated' || patient.unreadNotes > 0) && (
        <section className="attention-panel">
          <p className="eyebrow">Needs attention</p>
          <h3>Review relevant signals before the next visit</h3>
          <ul className="attention-list">
            {alerts.filter((alert) => alert.status === 'active').map((alert) => <li key={alert.id}><strong>{alert.title}</strong><span>{alert.details || 'Clinical alert requires review.'}</span></li>)}
            {patient.status === 'escalated' && <li><strong>Escalated risk profile</strong><span>Risk score {patient.riskScore} requires clinician follow-up.</span></li>}
            {patient.unreadNotes > 0 && <li><strong>{patient.unreadNotes} unread patient note{patient.unreadNotes === 1 ? '' : 's'}</strong><span>Review recent patient-reported information.</span></li>}
          </ul>
        </section>
      )}

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
              {evidence && evidence.screeningSignal.score !== null && evidence.screeningSignal.score > 0 && <button type="button" className="button" onClick={applyScreeningSignal}>Use latest data ({evidence.screeningSignal.score})</button>}
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

      {evidence && <section className="panel evidence-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Patient-reported and connected data</p>
            <h3>Recent check-ins</h3>
          </div>
          <span className="muted">Read-only clinical context · synced {evidence.smartwatchHealthRecords[0]?.timestamp ? new Date(evidence.smartwatchHealthRecords[0].timestamp).toLocaleDateString() : 'not yet'}</span>
        </div>
        <div className="checkin-grid">
          {evidence.checkins.slice(0, 3).map((record) => <article className="checkin-card" key={record.id}>
            <div className="panel-heading"><strong>{record.title}</strong><small>{record.timestamp ? new Date(record.timestamp).toLocaleDateString() : 'Date not recorded'}</small></div>
            <p>{record.summary}</p>
            <div className="checkin-meta"><span>Mood: {recordValue(record, 'Mood')}</span><span>Medication: {recordValue(record, 'Medication')}</span><span>Sleep: {recordValue(record, 'Sleep')}</span></div>
          </article>)}
          {!evidence.checkins.length && <p className="muted">No patient check-ins have been synced.</p>}
        </div>
        <div className="evidence-summary">
          <div>
            <span>Screening signal</span>
            <strong>{evidence.screeningSignal.score === null ? 'No data' : `${evidence.screeningSignal.score} / 100`}</strong>
          </div>
          <div>
            <span>Check-ins</span>
            <strong>{evidence.checkins.length}</strong>
          </div>
          <div>
            <span>Voice notes</span>
            <strong>{evidence.transcriptions.length}</strong>
          </div>
          <div>
            <span>Smartwatch records</span>
            <strong>{evidence.smartwatchHealthRecords.length}</strong>
          </div>
        </div>
        {evidence.screeningSignal.reasons.length > 0 && <p className="evidence-note"><strong>{evidence.screeningSignal.level} signal:</strong> {evidence.screeningSignal.reasons.join(' ')}</p>}
        <div className="trend-grid">
          <div><span>Heart rate</span><strong>{evidence.smartwatchHealthRecords[0] ? recordValue(evidence.smartwatchHealthRecords[0], 'Heart rate') : 'Not available'}</strong><small>Latest wearable reading</small></div>
          <div><span>Activity</span><strong>{evidence.smartwatchHealthRecords[0] ? recordValue(evidence.smartwatchHealthRecords[0], 'Steps') : 'Not available'}</strong><small>Latest daily steps</small></div>
          <div><span>Sleep quality</span><strong>{evidence.smartwatchHealthRecords[0] ? recordValue(evidence.smartwatchHealthRecords[0], 'Sleep') : 'Not available'}</strong><small>Latest synced sleep</small></div>
        </div>
        <details className="history-disclosure">
          <summary>View health, symptom, and wellness history</summary>
        <div className="evidence-columns">
          {([
            ['Check-ins', evidence.checkins],
            ['Voice notes', evidence.transcriptions],
            ['Goals', evidence.goals],
            ['Smartwatch', evidence.smartwatchHealthRecords],
          ] as const).map(([label, records]) => <div key={label}>
            <h4>{label}</h4>
            {!records.length && <p className="muted">No records found.</p>}
            <ul className="evidence-list">
              {records.slice(0, 5).map((record) => <li key={record.id}>
                <strong>{record.title}</strong>
                <span>{record.summary}</span>
                {record.timestamp && <small>{new Date(record.timestamp).toLocaleString()}</small>}
                {record.values.length > 0 && <span className="evidence-values">{record.values.map(({ label: valueLabel, value }) => `${valueLabel}: ${value}`).join(' | ')}</span>}
              </li>)}
            </ul>
          </div>)}
        </div>
        </details>
      </section>}
    </div>
  )
}
