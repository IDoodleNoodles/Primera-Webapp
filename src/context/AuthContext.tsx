import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '../firebase'
import { recordLogin, recordLogout, recordUnauthorizedAccess } from '../services/portalService'
import type { UserSession } from '../types'

type ErrorWithCode = { code?: unknown }

function errorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String((error as ErrorWithCode).code) : 'unknown'
}

class AdminCheckError extends Error {
  constructor(message: string, code: string) {
    super(message)
    this.name = 'AdminCheckError'
    this.code = code
  }

  code: string
}

function describeAuthError(authError: unknown) {
  const code = errorCode(authError)
  if (code.startsWith('admin-') || code === 'permission-denied' || code === 'unavailable' || code === 'deadline-exceeded') {
    return describeAdminCheckError(authError)
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Invalid email or password.'
  if (code === 'auth/user-disabled') return 'This administrator account is disabled.'
  if (code === 'auth/too-many-requests') return 'Too many sign-in attempts. Try again later.'
  if (code === 'auth/network-request-failed') return 'Unable to reach Firebase Authentication.'
  return authError instanceof Error ? authError.message : 'Unable to load portal access.'
}

function describeAdminCheckError(error: unknown) {
  const code = errorCode(error)
  if (code === 'admin-profile-not-found') return 'Admin profile not found'
  if (code === 'admin-account-inactive') return 'Admin account is inactive'
  if (code === 'permission-denied') return 'Permission denied reading admin profile (check Firestore rules)'
  if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network-request-failed') {
    return 'Cannot reach Firestore (check ad blocker or network)'
  }
  return 'Unable to load portal access.'
}

function isAdminCheckError(error: unknown) {
  const code = errorCode(error)
  return code.startsWith('admin-') || code === 'permission-denied' || code === 'unavailable' || code === 'deadline-exceeded'
}

function logAuthError(error: unknown) {
  console.error('[Auth] Sign-in or admin verification failed', { code: errorCode(error), error })
}

type AuthContextValue = {
  user: UserSession | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  verifyAdmin: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(firebaseConfigured)
  const [error, setError] = useState<string | null>(null)

  const checkAdminAccess = useCallback(async () => {
    if (!auth?.currentUser || !db) return
    const adminDocument = await getDoc(doc(db, 'admins', auth.currentUser.uid))
    if (!adminDocument.exists()) throw new AdminCheckError('Admin profile not found', 'admin-profile-not-found')
    if (adminDocument.data().active !== true) throw new AdminCheckError('Admin account is inactive', 'admin-account-inactive')
  }, [])

  const verifyAdmin = useCallback(async () => {
    if (!auth?.currentUser || !db) return false
    try {
      await checkAdminAccess()
      return true
    } catch (verificationError) {
      logAuthError(verificationError)
      setError(describeAdminCheckError(verificationError))
      return false
    }
  }, [checkAdminAccess])

  useEffect(() => {
    if (!auth) {
      return
    }

    const firebaseAuth = auth
    return onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      setError(null)
      try {
        await checkAdminAccess()
        await recordLogin()
        setUser({
          uid: firebaseUser.uid,
          name: firebaseUser.displayName ?? firebaseUser.email ?? 'Administrator',
          email: firebaseUser.email ?? '',
          role: 'admin',
        })
      } catch (authError) {
        if (isAdminCheckError(authError)) await recordUnauthorizedAccess().catch(() => undefined)
        setUser(null)
        logAuthError(authError)
        setError(describeAuthError(authError))
        await signOut(firebaseAuth).catch(() => undefined)
      } finally {
        setLoading(false)
      }
    })
  }, [checkAdminAccess])

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
        logAuthError(signInError)
        throw new Error(describeAuthError(signInError), { cause: signInError })
      }
    },
    logout: async () => {
      if (auth?.currentUser) await recordLogout().catch(() => undefined)
      if (auth) await signOut(auth)
      setUser(null)
    },
    verifyAdmin,
  }), [error, loading, user, verifyAdmin])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
