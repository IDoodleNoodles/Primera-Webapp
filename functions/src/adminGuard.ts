export function hasAdminRole(request: { auth?: { token?: Record<string, unknown> } }) {
  return request.auth?.token?.role === 'admin'
}
