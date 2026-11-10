import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, firebaseConfigured } from '../firebase'
import { recordAuthFailure, recordLogin, recordLogout } from '../services/portalService'
import type { UserSession } from '../types'

function describeAuthError(authError: unknown) {
  const code = typeof authError === 'object' && authError && 'code' in authError ? String(authError.code) : ''
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Invalid email or password.'
  if (code === 'auth/user-disabled') return 'This administrator account is disabled.'
  if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Try again later.'
  if (code === 'auth/network-request-failed') return 'Unable to reach Firebase Authentication.'
  return authError instanceof Error ? authError.message : 'Unable to load portal access.'
}

type AuthContextValue = {
  user: UserSession | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(firebaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      return
    }

    const firebaseAuth = auth
    return onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setError(null)
      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      try {
        const tokenResult = await firebaseUser.getIdTokenResult(true)
        if (tokenResult.claims.role !== 'admin') {
          throw new Error('This account is not authorized for the administrator portal.')
        }
        await recordLogin()
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName ?? firebaseUser.email ?? 'Administrator',
          email: firebaseUser.email ?? '',
          role: 'admin',
        })
      } catch (authError) {
        setUser(null)
        setError(describeAuthError(authError))
        await signOut(firebaseAuth).catch(() => undefined)
      } finally {
        setLoading(false)
      }
    })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    error,
    signIn: async (email, password) => {
      if (!auth) throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local.')
      setError(null)
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } catch (signInError) {
        await recordAuthFailure().catch(() => undefined)
        throw new Error(describeAuthError(signInError), { cause: signInError })
      }
    },
    logout: async () => {
      if (auth?.currentUser) await recordLogout().catch(() => undefined)
      if (auth) await signOut(auth)
      setUser(null)
    },
  }), [error, loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
