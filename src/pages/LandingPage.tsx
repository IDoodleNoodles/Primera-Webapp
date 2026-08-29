import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { firebaseConfigured } from '../firebase'

export function LandingPage() {
  const { user, loading, error, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (loading) return <div className="landing-page"><p>Checking portal access...</p></div>
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/doctor'} replace />

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
          <p className="eyebrow">Primera Admin & OBGYN Portal</p>
          <h1>Warm, focused tools for maternal care teams</h1>
          <p className="muted">
            Access the administrative dashboard and OB-GYN monitoring tools for pregnancy risk review, assignment workflows, and alert management.
          </p>
        </div>

        <div className="landing-card">
          <p className="eyebrow">Sign in</p>
          <h2>Welcome back</h2>
          <p className="muted">Use your staff account to open the operations or clinical workspace.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="button primary" type="submit">Sign in to portal</button>
          </form>

          {!firebaseConfigured && <p className="form-message">Firebase is not configured. Copy `.env.example` to `.env.local` and add your project credentials.</p>}
          {(error || formError) && <p className="form-error">{error || formError}</p>}
        </div>
      </div>
    </div>
  )
}
