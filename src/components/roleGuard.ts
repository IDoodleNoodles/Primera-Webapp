import type { Role } from '../types'

export function isAllowedRole(role: Role | undefined, allowedRoles: Role[]) {
  return role !== undefined && allowedRoles.includes(role)
}
