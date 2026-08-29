import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '../firebase'
import type { Role, UserSession } from '../types'

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

      const tokenResult = await firebaseUser.getIdTokenResult()
      const role = tokenResult.claims.role as Role | undefined
      const profile = await getDoc(doc(firestore, 'users', firebaseUser.uid))
      const profileData = profile.data()

      if (role !== 'admin' && role !== 'doctor') {
        setError('This portal is restricted to admin and OBGYN accounts.')
        await signOut(firebaseAuth)
        setUser(null)
      } else {
        setUser({
          uid: firebaseUser.uid,
          name: profileData?.name ?? firebaseUser.displayName ?? firebaseUser.email ?? 'Portal user',
          email: firebaseUser.email ?? '',
          role,
        })
      }

      setLoading(false)
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
        await signInWithEmailAndPassword(auth, email, password)
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
