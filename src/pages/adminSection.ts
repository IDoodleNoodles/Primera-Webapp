export type AdminSection = 'overview' | 'patients' | 'doctors' | 'assignments' | 'requests' | 'risk' | 'logs'

export function adminSection(pathname: string): AdminSection {
  if (pathname.includes('/patients')) return 'patients'
  if (pathname.includes('/doctors')) return 'doctors'
  if (pathname.includes('/assignments')) return 'assignments'
  if (pathname.includes('/requests')) return 'requests'
  if (pathname.includes('/risk')) return 'risk'
  if (pathname.includes('/logs')) return 'logs'
  return 'overview'
}
