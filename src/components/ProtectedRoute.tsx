import { Navigate } from 'react-router-dom'
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
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (!isAllowedRole(user.role, allowedRoles)) {
    const fallback = user.role === 'admin' ? '/admin' : user.role === 'doctor' ? '/doctor' : '/'
    return <Navigate to={fallback} replace />
  }

  return <>{children}</>
}
