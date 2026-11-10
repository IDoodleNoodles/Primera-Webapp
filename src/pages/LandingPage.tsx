import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { firebaseConfigured } from '../firebase'

export function LandingPage() {
  const { user, loading, error, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (loading) return <div className="landing-page"><p>Checking admin access...</p></div>
  if (user) return <Navigate to="/admin" replace />

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    try {
      await signIn(email, password)
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Unable to sign in.')
    }
  }

  return (
    <div className="landing-page">
      <div className="landing-shell">
        <div className="landing-intro">
          <p className="eyebrow">Primera Admin Portal</p>
          <h1>Account operations with privacy by default</h1>
          <p className="muted">Manage patient basic account information and activity status. Clinical and maternal health data is not available in this portal.</p>
        </div>
        <div className="landing-card">
          <p className="eyebrow">Administrator sign in</p>
          <h2>Welcome back</h2>
          <form className="login-form" onSubmit={handleSubmit}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="button primary" type="submit">Sign in</button>
          </form>
          {!firebaseConfigured && <p className="form-message">Firebase is not configured. Copy `.env.local.example` to `.env.local` and add project credentials.</p>}
          {(error || formError) && <p className="form-error">{error || formError}</p>}
        </div>
      </div>
    </div>
  )
}
