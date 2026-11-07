export type AdminSection = 'overview' | 'doctors'

export function adminSection(pathname: string): AdminSection {
  if (pathname.includes('/doctors')) return 'doctors'
  return 'overview'
}
