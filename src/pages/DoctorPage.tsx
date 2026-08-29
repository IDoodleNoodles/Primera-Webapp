import { ArrowUpRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { firebaseConfigured } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { getMockDoctorAlerts, getMockDoctorDashboard } from '../data/mockPortalData'
import { fetchDoctorAlerts, fetchDoctorDashboardData, getEmptyDoctorDashboard } from '../services/portalService'
import type { DoctorDashboardData } from '../services/portalService'
import type { DoctorAlert } from '../types'

function doctorSection(pathname: string) {
  if (pathname.includes('/alerts')) return 'alerts'
  if (pathname.endsWith('/patients') || pathname.includes('/patients')) return 'patients'
  return 'overview'
}

export function DoctorPage() {
  const { user } = useAuth()
  const section = doctorSection(useLocation().pathname)
  const demoMode = !firebaseConfigured
  const [dashboard, setDashboard] = useState<DoctorDashboardData | null>(null)
  const [alerts, setAlerts] = useState<DoctorAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || user.role !== 'doctor') {
      setLoading(false)
      return
    }

    if (demoMode) {
      setDashboard(getMockDoctorDashboard(user.uid))
      setAlerts(getMockDoctorAlerts(user.uid))
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all([
      fetchDoctorDashboardData(user.uid),
      fetchDoctorAlerts(user.uid),
    ])
      .then(([nextDashboard, nextAlerts]) => {
        setDashboard(nextDashboard)
        setAlerts(nextAlerts)
      })
      .catch(() => {
        setDashboard(getEmptyDoctorDashboard())
        setAlerts([])
        setError('Unable to load live assigned patient data.')
      })
      .finally(() => setLoading(false))
  }, [user, demoMode])

  if (loading || !dashboard) {
    return (
      <div className="page">
        <section className="panel">
          <p className="eyebrow">Loading</p>
          <h2>Fetching assigned patient data</h2>
          <p className="muted">Pulling your latest case queue from Firebase.</p>
        </section>
      </div>
    )
  }

  const patientsById = new Map(dashboard.assignedPatients.map((patient) => [patient.id, patient.name]))

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">OBGYN dashboard</p>
          <h2>
            {section === 'alerts' && 'Risk alerts'}
            {section === 'patients' && 'Assigned patients'}
            {section === 'overview' && 'Assigned pregnancy cases'}
          </h2>
        </div>
      </header>

      {demoMode && <p className="form-message">Prototype data is shown because Firebase is not configured.</p>}
      {error && <p className="form-error">{error}</p>}

      {section === 'overview' && (
        <section className="metric-grid">
          {dashboard.metrics.map((metric) => (
            <article key={metric.label} className="metric-card">
              <p>{metric.label}</p>
              <h3>{metric.value}</h3>
              <span>{metric.change}</span>
            </article>
          ))}
        </section>
      )}

      {section === 'alerts' ? (
        <section className="panel">
          <p className="eyebrow">Review queue</p>
          <h3>High-risk cases and clinical alerts</h3>
          <ul className="list">
            {dashboard.reviewPatients.map((patient) => (
              <li key={patient.id}>
                <div>
                  <strong>{patient.name}</strong>
                  <span>{patient.status} · score {patient.riskScore}</span>
                </div>
                <Link to={`/doctor/patients/${patient.id}`} className="button">Open</Link>
              </li>
            ))}
            {!dashboard.reviewPatients.length && <li><span className="muted">No high-risk assigned patients.</span></li>}
          </ul>
          <ul className="list">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <div>
                  <strong>{alert.title}</strong>
                  <span>{patientsById.get(alert.patientId) ?? 'Assigned patient'}</span>
                  <span className="muted">{alert.status} {alert.createdAt ? `- ${new Date(alert.createdAt).toLocaleDateString()}` : ''}</span>
                </div>
                <Link to={`/doctor/patients/${alert.patientId}`} className="button">Open</Link>
              </li>
            ))}
            {!alerts.length && <li><span className="muted">No alerts in your queue yet.</span></li>}
          </ul>
        </section>
      ) : (
        <>
          {!dashboard.assignedPatients.length ? (
            <section className="panel">
              <p className="eyebrow">No assignments yet</p>
              <h3>Your queue is currently empty</h3>
              <p className="muted">Assigned pregnancy cases will appear here once linked to your account.</p>
            </section>
          ) : null}

          <section className="patient-grid">
            {dashboard.assignedPatients.map((patient) => (
              <Link key={patient.id} to={`/doctor/patients/${patient.id}`} className="patient-card">
                <div className="patient-card-top">
                  <div>
                    <h3>{patient.name}</h3>
                    <span className="muted">Risk score: {patient.riskScore}</span>
                  </div>
                  <span className={`risk-badge ${patient.riskLevel}`}>{patient.riskLevel}</span>
                </div>

                <div className="mini-stats">
                  <span>Symptoms: {patient.symptoms}</span>
                  <span>Alerts: {patient.alertCount}</span>
                </div>

                <div className="patient-card-footer">
                  <span>Last check-in: {patient.lastCheckIn ? new Date(patient.lastCheckIn).toLocaleDateString() : 'N/A'}</span>
                  <ArrowUpRight size={16} />
                </div>
              </Link>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
