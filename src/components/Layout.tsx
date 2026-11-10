import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

const baseLinkClass = ({ isActive }: { isActive: boolean }) =>
  `nav-link ${isActive ? 'nav-link-active' : ''}`

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand"><span className="brand-mark">P</span> Primera Admin</div>
          <nav className="nav">
            <NavLink to="/admin" end className={baseLinkClass}>Overview</NavLink>
            <NavLink to="/admin/accounts" className={baseLinkClass}>Patient accounts</NavLink>
            <NavLink to="/admin/audit" className={baseLinkClass}>Audit log</NavLink>
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="user-tag">{user?.name}</div>
          <button className="button subtle" onClick={() => void logout()}>Sign out</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
