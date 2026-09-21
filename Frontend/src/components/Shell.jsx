import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Icon, { LogoMark } from './Icon'
import { initials } from './ui'

/**
 * Navigation is grouped by the job being done rather than by role, and a user
 * sees the union of the groups their roles unlock — an admin gets everything,
 * a contractor gets only their own work.
 */
const GROUPS = [
  {
    title: 'Delivery',
    show: (a) => a.isManager || a.isAdmin,
    items: [
      { to: '/dashboard', label: 'Overview', icon: 'dashboard' },
      { to: '/contracts', label: 'Contracts', icon: 'contract', end: true },
      { to: '/contracts/intake', label: 'Contract intake', icon: 'sparkles', badge: 'AI' },
      { to: '/clients', label: 'Clients', icon: 'building' },
      { to: '/employees', label: 'Workforce', icon: 'users' },
      { to: '/worklogs/pending', label: 'Approvals', icon: 'checkCircle' },
    ],
  },
  {
    title: 'Finance',
    show: (a) => a.isFinance || a.isAdmin,
    items: [
      { to: '/finance/invoices', label: 'Invoices', icon: 'receipt' },
      { to: '/finance/audit', label: 'Invoice auditor', icon: 'scan', badge: 'AI' },
      { to: '/finance/milestones', label: 'Milestones', icon: 'flag' },
      { to: '/finance/worklogs', label: 'Approved work', icon: 'clock' },
    ],
  },
  {
    title: 'People',
    show: (a) => a.isHR || a.isAdmin,
    items: [
      { to: '/hr/employees', label: 'Employees', icon: 'userPlus' },
      { to: '/hr/skills', label: 'Skills', icon: 'tag' },
      { to: '/hr/users', label: 'Users', icon: 'key' },
      { to: '/hr/roles', label: 'Roles', icon: 'shield' },
    ],
  },
  {
    title: 'Compliance',
    show: (a) => a.isAuditor && !a.isAdmin && !a.isFinance,
    items: [
      { to: '/contracts', label: 'Contracts', icon: 'contract', end: true },
      { to: '/finance/audit', label: 'Invoice audits', icon: 'scan' },
    ],
  },
  {
    title: 'My work',
    show: (a) => a.isEmployee || a.isAdmin,
    items: [
      { to: '/my-assignments', label: 'Assignments', icon: 'briefcase' },
      { to: '/my-worklogs', label: 'Timesheets', icon: 'clock' },
      { to: '/my-availability', label: 'Availability', icon: 'calendar' },
    ],
  },
]

function roleLabel(auth) {
  if (auth.isAdmin) return 'Platform admin'
  const labels = []
  if (auth.isManager) labels.push('Delivery manager')
  if (auth.isHR) labels.push('HR')
  if (auth.isFinance) labels.push('Finance')
  if (auth.isAuditor) labels.push('Auditor')
  if (auth.isEmployee) labels.push('Contractor')
  return labels.join(' · ') || 'Member'
}

export default function Shell({ children }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const seen = new Set()
  const groups = GROUPS.filter((g) => g.show(auth))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => (seen.has(item.to) ? false : seen.add(item.to))),
    }))
    .filter((g) => g.items.length > 0)

  const username = auth.user?.username ?? ''

  function handleLogout() {
    auth.logout()
    navigate('/login')
  }

  return (
    <div className="app">
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Primary">
        <div className="brand">
          <LogoMark />
          <div className="brand-name">
            WorkLedger <span>AI</span>
          </div>
        </div>

        <nav className="nav">
          {groups.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="eyebrow nav-group-title">{group.title}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar">{initials(username)}</span>
            <div className="grow">
              <div className="t-label t-wrap">{username}</div>
              <div className="t-sm t-mute">{roleLabel(auth)}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <div className="brand" style={{ padding: 0 }}>
            <LogoMark />
            <div className="brand-name">
              WorkLedger <span>AI</span>
            </div>
          </div>
          <span className="grow" />
          <span className="avatar avatar-sm" title={username}>
            {initials(username)}
          </span>
        </header>

        <main className="page">{children}</main>
      </div>
    </div>
  )
}
