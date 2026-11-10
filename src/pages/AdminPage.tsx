import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  fetchAdminDashboard,
  fetchAuditLogs,
  fetchPatientAccounts,
  recordAuditExport,
  resetPatientPassword,
  setPatientAccountStatus,
  updatePatientAccount,
} from '../services/portalService'
import type { AccountCursor, AdminDashboard } from '../services/portalService'
import type { AuditLog, PatientAccount } from '../types'

type Section = 'overview' | 'accounts' | 'audit'

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'Not available' : date.toLocaleString()
}

function downloadCsv(logs: AuditLog[]) {
  const rows = [
    ['Actor', 'Action', 'Target', 'When', 'Result'],
    ...logs.map((log) => [log.actorEmail, log.action, `${log.targetType}:${log.targetId}`, formatDate(log.timestamp), log.result]),
  ]
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'primera-audit-log.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return <section className="panel state-block state-error"><p>{message}</p><button className="button primary" onClick={retry}>Retry</button></section>
}

function Overview({ dashboard }: { dashboard: AdminDashboard }) {
  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">Admin portal</p><h2>Account overview</h2></div><Link className="button primary" to="/admin/accounts">Manage patient accounts</Link></header>
      <section className="metric-grid" aria-label="Account summary">
        <article className="metric-card"><span>Total patient accounts</span><strong>{dashboard.totalPatientAccounts}</strong><small>Basic account records</small></article>
        <article className="metric-card"><span>Active accounts</span><strong>{dashboard.activePatientAccounts}</strong><small>Currently enabled</small></article>
        <article className="metric-card"><span>Disabled accounts</span><strong>{dashboard.disabledPatientAccounts}</strong><small>Currently disabled</small></article>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Audit log</p><h3>Recent activity</h3></div><Link className="button" to="/admin/audit">View all</Link></div>
        {dashboard.recentAuditLogs.length === 0 ? <div className="state-block"><p>No activity is available.</p></div> : <AuditTable logs={dashboard.recentAuditLogs} />}
      </section>
    </div>
  )
}

function AuditTable({ logs }: { logs: AuditLog[] }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Actor</th><th>Action</th><th>Target</th><th>When</th><th>Result</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{log.actorEmail}</td><td>{log.action}</td><td>{`${log.targetType}:${log.targetId}`}</td><td>{formatDate(log.timestamp)}</td><td>{log.result}</td></tr>)}</tbody></table></div>
}

function Accounts() {
  const [accounts, setAccounts] = useState<PatientAccount[]>([])
  const [nextCursor, setNextCursor] = useState<Awaited<ReturnType<typeof fetchPatientAccounts>>['nextCursor']>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PatientAccount | null>(null)
  const [fields, setFields] = useState({ name: '', username: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  const load = useCallback(async (pageCursor: AccountCursor | null = null) => {
    setLoading(true)
    setError('')
    try {
      const page = await fetchPatientAccounts(search, pageCursor)
      setAccounts(page.accounts)
      setNextCursor(page.nextCursor)
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load patient accounts.') }
    finally { setLoading(false) }
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 300)
    return () => window.clearTimeout(timer)
  }, [load])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setBusy('save'); setError(''); setMessage('')
    try {
      await updatePatientAccount(editing.uid, { name: fields.name.trim(), username: fields.username.trim() })
      setEditing(null); setMessage('Account updated.'); await load()
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to update account.') }
    finally { setBusy('') }
  }

  async function toggle(account: PatientAccount) {
    const status = account.status === 'disabled' ? 'active' : 'disabled'
    setBusy(account.uid); setError(''); setMessage('')
    try { await setPatientAccountStatus(account.uid, status); setMessage(`Account ${status === 'active' ? 'enabled' : 'disabled'}.`); await load() }
    catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : 'Unable to change account status.') }
    finally { setBusy('') }
  }

  async function reset(account: PatientAccount) {
    setBusy(account.uid); setError(''); setMessage('')
    try { await resetPatientPassword(account.uid); setMessage('Password reset requested. The account email will receive recovery instructions.') }
    catch (resetError) { setError(resetError instanceof Error ? resetError.message : 'Unable to request password reset.') }
    finally { setBusy('') }
  }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">Patient accounts</p><h2>Basic information and status</h2></div></header>
    <p className="muted">Only name, username, email, status, created date, and last active are available here. Patient accounts are created in the mobile app. Status changes affect Android login enforcement; this portal cannot disable Firebase Authentication users.</p>
    {message && <p className="form-message">{message}</p>}{error && <p className="form-error">{error}</p>}
    <section className="panel">
      <label>Search accounts<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, username, or email" /></label>
      {loading ? <div className="state-block"><p>Loading accounts...</p></div> : accounts.length === 0 ? <div className="state-block"><p>No accounts found.</p></div> : <><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Status</th><th>Created</th><th>Last active</th><th>Actions</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.uid}><td>{account.name || 'Not set'}</td><td>{account.username || 'Not set'}</td><td>{account.email || 'Not set'}</td><td><span className={`status-badge ${account.status === 'disabled' ? 'status-warning' : 'status-good'}`}>{account.status}</span></td><td>{formatDate(account.createdAt)}</td><td>{formatDate(account.lastActive)}</td><td className="table-actions"><button className="button" onClick={() => { setEditing(account); setFields({ name: account.name, username: account.username }) }}>Edit</button><button className="button" disabled={busy !== ''} onClick={() => void toggle(account)}>{account.status === 'disabled' ? 'Enable' : 'Disable'}</button><button className="button" disabled={busy !== ''} onClick={() => void reset(account)}>Reset password</button></td></tr>)}</tbody></table></div>{nextCursor && <button className="button" onClick={() => void load(nextCursor)}>Next page</button>}</>}
    </section>
    {editing && <section className="panel confirmation-dialog"><h3>Edit basic information</h3><form className="admin-form" onSubmit={(event) => void save(event)}><label>Name<input value={fields.name} onChange={(event) => setFields({ ...fields, name: event.target.value })} required /></label><label>Username<input value={fields.username} onChange={(event) => setFields({ ...fields, username: event.target.value })} required /></label><label>Email<input value={editing.email} readOnly /></label><div className="form-actions"><button className="button primary" disabled={busy === 'save'}>Save changes</button><button type="button" className="button" onClick={() => setEditing(null)}>Cancel</button></div></form></section>}
  </div>
}

function Audit() {
  const [filter, setFilter] = useState('')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setLogs(await fetchAuditLogs(filter)) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load audit logs.') }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function exportLogs() {
    try { await recordAuditExport(filter, logs.length); downloadCsv(logs) }
    catch (exportError) { setError(exportError instanceof Error ? exportError.message : 'Unable to record the export.') }
  }

  return <div className="page"><header className="page-header"><div><p className="eyebrow">Auditability</p><h2>Audit log</h2></div><button className="button primary" disabled={!logs.length} onClick={() => void exportLogs()}>Export CSV</button></header><section className="panel"><label>Filter<input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter action or target" /></label>{error && <p className="form-error">{error}</p>}{loading ? <div className="state-block"><p>Loading audit logs...</p></div> : logs.length === 0 ? <div className="state-block"><p>No audit activity is available.</p></div> : <AuditTable logs={logs} />}</section></div>
}

export function AdminPage({ section }: { section: Section }) {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [error, setError] = useState('')
  const { user } = useAuth()

  useEffect(() => {
    if (section !== 'overview' || !user) return
    fetchAdminDashboard().then(setDashboard).catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load the dashboard.'))
  }, [section, user])

  if (section === 'accounts') return <Accounts />
  if (section === 'audit') return <Audit />
  if (error) return <div className="page"><ErrorState message={error} retry={() => window.location.reload()} /></div>
  if (!dashboard) return <div className="page"><section className="panel state-block"><p>Loading dashboard...</p></section></div>
  return <Overview dashboard={dashboard} />
}
