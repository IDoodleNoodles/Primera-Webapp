import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { firebaseConfigured } from '../firebase'

function roleLabel(role: string) {
  return role === 'doctor' ? 'OB-GYN' : role
}

export function DoctorProfilePage() {
  const { user, changePassword, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      await changePassword(password)
      setPassword('')
      setConfirmation('')
      setMessage('Password changed successfully.')
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : 'Unable to change your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Doctor profile</h2>
        </div>
      </header>

      {!firebaseConfigured && <p className="form-message">Password changes are unavailable in prototype mode.</p>}
      {message && <p className="form-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="panel">
        <p className="eyebrow">Profile details</p>
        <div className="profile-details">
          <div><span className="muted">Name</span><strong>{user?.name || 'Not provided'}</strong></div>
          <div><span className="muted">Email</span><strong>{user?.email || 'Not provided'}</strong></div>
          <div><span className="muted">Role</span><strong>{roleLabel(user?.role ?? '')}</strong></div>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Security</p>
        <h3>Change password</h3>
        <form className="form-stack" onSubmit={submitPassword}>
          <label>
            New password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
          </label>
          <label>
            Confirm new password
            <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
          </label>
          <div className="form-actions">
            <button className="button primary" type="submit" disabled={busy || !firebaseConfigured}>
              {busy ? 'Changing password...' : 'Change password'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow">Session</p>
        <h3>Sign out of Primera</h3>
        <p className="muted">End your current doctor portal session on this device.</p>
        <button className="button" type="button" onClick={() => logout()}>Sign Out</button>
      </section>
    </div>
  )
}
