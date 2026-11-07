import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '../firebase'
import type { Role, UserSession } from '../types'

function describeAuthError(authError: unknown) {
  const code = typeof authError === 'object' && authError && 'code' in authError
    ? String(authError.code)
    : ''

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Confirm the staff account exists and try again.'
  }
  if (code === 'auth/user-disabled') {
    return 'This staff account is disabled. Ask an administrator to enable it.'
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many sign-in attempts. Wait a few minutes and try again.'
  }
  if (code === 'auth/network-request-failed') {
    return 'Unable to reach Firebase Authentication. Check your connection and try again.'
  }

  return authError instanceof Error ? authError.message : 'Unable to load portal access.'
}

type AuthContextValue = {
  user: UserSession | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  changePassword: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(firebaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth || !db) {
      return
    }

    const firebaseAuth = auth
    const firestore = db

    return onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
      setError(null)

      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        return
      }

      try {
        const tokenResult = await firebaseUser.getIdTokenResult(true)
        const role = tokenResult.claims.role as Role | undefined
        const profile = await getDoc(doc(firestore, 'users', firebaseUser.uid))
        const profileData = profile.data()

        if (role !== 'admin' && role !== 'doctor') {
          setError('Your account is authenticated but has no valid portal role. Run the staff role setup, then sign out and sign in again.')
          await signOut(firebaseAuth)
          setUser(null)
        } else {
          setUser({
            uid: firebaseUser.uid,
            name: typeof profileData?.name === 'string' && profileData.name.trim()
              ? profileData.name.trim()
              : firebaseUser.displayName ?? firebaseUser.email ?? 'Portal user',
            email: firebaseUser.email ?? '',
            role,
          })
        }
      } catch (authError) {
        setUser(null)
        setError(describeAuthError(authError))
        await signOut(firebaseAuth).catch(() => undefined)
      } finally {
        setLoading(false)
      }
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      signIn: async (email, password) => {
        if (!auth) {
          throw new Error('Firebase is not configured. Add the VITE_FIREBASE_* values to .env.local.')
        }

        setError(null)
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password)
        await credential.user.getIdToken(true)
      },
      changePassword: async (password) => {
        if (!auth?.currentUser) {
          throw new Error('You must be signed in to change your password.')
        }

        await updatePassword(auth.currentUser, password)
      },
      logout: async () => {
        if (auth) await signOut(auth)
        setUser(null)
      },
    }),
    [error, loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Keep the provider and its context hook together for the auth boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
