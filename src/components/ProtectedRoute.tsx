import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import type { Role } from '../types'
import { isAllowedRole } from './roleGuard'

export function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[]
  children: ReactNode
}) {
  const { user, verifyAdmin, logout } = useAuth()
  const location = useLocation()
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void verifyAdmin().then((active) => {
      if (!active) return logout()
      setVerifiedUid(user.uid)
    })
  }, [location.pathname, logout, user, verifyAdmin])

  if (!user) return <Navigate to="/" replace />
  if (!isAllowedRole(user.role, allowedRoles)) return <Navigate to="/" replace />
  if (verifiedUid !== user.uid) return <section className="panel state-block"><p>Verifying administrator access...</p></section>
  return <>{children}</>
}
