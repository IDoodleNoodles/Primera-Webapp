export type AdminSection = 'overview' | 'patients' | 'doctors' | 'assignments' | 'logs'

export function adminSection(pathname: string): AdminSection {
  if (pathname.includes('/patients')) return 'patients'
  if (pathname.includes('/doctors')) return 'doctors'
  if (pathname.includes('/assignments')) return 'assignments'
  if (pathname.includes('/logs')) return 'logs'
  return 'overview'
}
