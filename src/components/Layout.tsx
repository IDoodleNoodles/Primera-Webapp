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
            <NavLink to="/admin" className={baseLinkClass}>Overview</NavLink>
            <NavLink to="/admin/patients" className={baseLinkClass}>Patient Registry</NavLink>
            <NavLink to="/admin/doctors" className={baseLinkClass}>Doctor Registry</NavLink>
            <NavLink to="/admin/assignments" className={baseLinkClass}>Assignments</NavLink>
            <NavLink to="/admin/logs" className={baseLinkClass}>Audit Trail</NavLink>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-tag">{user?.name}</div>
          <button className="button subtle" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  )
}

export function DoctorShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand"><span className="brand-mark">P</span> Primera OBGYN</div>
          <nav className="nav">
            <NavLink to="/doctor" end className={baseLinkClass}>Case Dashboard</NavLink>
            <NavLink to="/doctor/patients" className={baseLinkClass}>Assigned Patients</NavLink>
            <NavLink to="/doctor/alerts" className={baseLinkClass}>Alerts / Needs Review</NavLink>
            <NavLink to="/doctor/profile" className={baseLinkClass}>Profile</NavLink>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-tag">{user?.name}</div>
          <button className="button subtle" onClick={() => logout()}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  )
}
