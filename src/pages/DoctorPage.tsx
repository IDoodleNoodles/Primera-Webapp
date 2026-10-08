import { ArrowUpRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { firebaseConfigured } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { getMockDoctorAlerts, getMockDoctorDashboard } from '../data/mockPortalData'
import { fetchDoctorAlerts, fetchDoctorDashboardData, getEmptyDoctorDashboard } from '../services/portalService'
import type { DoctorDashboardData } from '../services/portalService'
import type { DoctorAlert, Patient } from '../types'

function doctorSection(pathname: string) {
  if (pathname.includes('/alerts')) return 'alerts'
  if (pathname.endsWith('/patients') || pathname.includes('/patients')) return 'patients'
  return 'overview'
}

function formatGestation(patient: Patient) {
  if (patient.pregnancyWeek) {
    return `${patient.pregnancyWeek} weeks${patient.trimester ? ` · ${patient.trimester}` : ''}`
  }

  return patient.trimester || 'Gestation not recorded'
}

function reviewLabel(patient: Patient) {
  if (patient.alertCount > 0) return `${patient.alertCount} alert${patient.alertCount === 1 ? '' : 's'}`
  if (patient.unreadNotes > 0) return 'Unread record'
  if (patient.status === 'escalated') return 'Follow-up indicated'
  return 'No review items'
}

function formatCheckIn(value: string) {
  return value ? new Date(value).toLocaleDateString() : 'Not recorded'
}

function alertCategoryLabel(category: DoctorAlert['category']) {
  if (category === 'recurring-symptom') return 'Recurring symptom'
  if (category === 'approved-rule-match') return 'Approved review rule'
  return 'Clinician-defined'
}

export function DoctorPage() {
  const { user } = useAuth()
  const section = doctorSection(useLocation().pathname)
  const demoMode = !firebaseConfigured
  const [dashboard, setDashboard] = useState<DoctorDashboardData | null>(null)
  const [alerts, setAlerts] = useState<DoctorAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [reviewFilter, setReviewFilter] = useState<'all' | 'needs-review' | 'no-review'>('all')

  useEffect(() => {
    if (!user || user.role !== 'doctor') {
      Promise.resolve().then(() => setLoading(false))
      return
    }

    if (demoMode) {
      Promise.resolve().then(() => {
        setDashboard(getMockDoctorDashboard(user.uid))
        setAlerts(getMockDoctorAlerts(user.uid))
        setLoading(false)
      })
      return
    }

    Promise.resolve().then(() => setLoading(true))
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

  const filteredPatients = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return (dashboard?.assignedPatients ?? []).filter((patient) => {
      const matchesSearch = !normalizedSearch || patient.name.toLowerCase().includes(normalizedSearch)
      const needsReview = patient.alertCount > 0 || patient.unreadNotes > 0 || patient.status === 'escalated'
      const matchesReview = reviewFilter === 'all' || (reviewFilter === 'needs-review' ? needsReview : !needsReview)
      return matchesSearch && matchesReview
    })
  }, [dashboard?.assignedPatients, reviewFilter, search])

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
            {section === 'alerts' && 'Alerts and review queue'}
            {section === 'patients' && 'Assigned patients'}
            {section === 'overview' && 'Doctor dashboard'}
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
          <p className="eyebrow">Alerts / needs review</p>
          <h3>Review observed events, not diagnoses</h3>
          <p className="muted">Alerts are prompts to review patient-provided or connected information. Trigger rules and terminology require OB-GYN consultant validation.</p>
          <ul className="list">
            {alerts.filter((alert) => alert.status === 'active').map((alert) => (
              <li key={alert.id}>
                <div>
                  <strong>{patientsById.get(alert.patientId) ?? 'Assigned patient'}</strong>
                  <span>{alert.title}</span>
                  <span>{alert.details || 'No additional context recorded.'}</span>
                  <small className="muted">{alertCategoryLabel(alert.category)} · {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : 'Date/time not recorded'}</small>
                </div>
                <div className="table-actions">
                  <Link to={`/doctor/patients/${alert.patientId}`} className="button">Review</Link>
                  <Link to={`/doctor/patients/${alert.patientId}`} className="button">Open patient</Link>
                </div>
              </li>
            ))}
            {!alerts.filter((alert) => alert.status === 'active').length && <li><span className="muted">No alerts in your queue yet.</span></li>}
          </ul>
          {!!dashboard.reviewPatients.length && <p className="section-heading muted">Patients with other review items: {dashboard.reviewPatients.map((patient) => `${patient.name} (${reviewLabel(patient)})`).join(', ')}.</p>}
        </section>
      ) : (
        <>
          {section === 'overview' && (
            <section className="panel review-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Start here</p>
                  <h3>Needs review now</h3>
                </div>
                <Link to="/doctor/alerts" className="button">View queue</Link>
              </div>
              {dashboard.reviewPatients.length ? (
                <ul className="list">
                  {dashboard.reviewPatients.slice(0, 4).map((patient) => (
                    <li key={patient.id}>
                      <div>
                        <strong>{patient.name}</strong>
                        <span>{reviewLabel(patient)} · last check-in {formatCheckIn(patient.lastCheckIn)}</span>
                      </div>
                      <Link to={`/doctor/patients/${patient.id}`} className="button">Open</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No patients or records need review right now.</p>
              )}
            </section>
          )}

          {!dashboard.assignedPatients.length ? (
            <section className="panel">
              <p className="eyebrow">No assignments yet</p>
              <h3>Your queue is currently empty</h3>
              <p className="muted">Assigned pregnancy cases will appear here once linked to your account.</p>
            </section>
          ) : null}

          <section className="panel patient-directory">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Patient directory</p>
                <h3>Find an assigned patient</h3>
              </div>
              <span className="muted">{filteredPatients.length} of {dashboard.assignedPatients.length} shown</span>
            </div>
            <div className="directory-filters">
              <label className="search-field">
                <span className="sr-only">Search assigned patients</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by patient name" />
              </label>
              <label>
                <span className="sr-only">Filter patient review status</span>
                <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as typeof reviewFilter)}>
                  <option value="all">All patients</option>
                  <option value="needs-review">Needs review</option>
                  <option value="no-review">No review items</option>
                </select>
              </label>
            </div>
            <div className="patient-grid">
            {filteredPatients.map((patient) => (
              <Link key={patient.id} to={`/doctor/patients/${patient.id}`} className="patient-card">
                <div className="patient-card-top">
                  <div>
                    <h3>{patient.name}</h3>
                    <span className="muted">{formatGestation(patient)}</span>
                  </div>
                  <span className={`review-badge ${patient.alertCount || patient.unreadNotes || patient.status === 'escalated' ? 'needs-review' : 'reviewed'}`}>
                    {patient.alertCount || patient.unreadNotes || patient.status === 'escalated' ? 'Needs review' : 'No review items'}
                  </span>
                </div>

                <div className="mini-stats">
                  <span>Review status</span>
                  <strong>{reviewLabel(patient)}</strong>
                </div>

                <div className="patient-card-footer">
                  <span>Last check-in: {formatCheckIn(patient.lastCheckIn)}</span>
                  <span className="open-patient-action">Open patient <ArrowUpRight size={16} /></span>
                </div>
              </Link>
            ))}
            {!filteredPatients.length && <p className="muted">No assigned patients match this search or filter.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
