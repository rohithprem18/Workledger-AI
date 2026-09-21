import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const MANAGER_NAV = [
  { to: '/dashboard',        label: 'DASHBOARD' },
  { to: '/contracts',        label: 'CONTRACTS' },
  { to: '/contracts/intake', label: 'INTAKE · AI' },
  { to: '/clients',          label: 'CLIENTS' },
  { to: '/employees',        label: 'WORKFORCE' },
  { to: '/worklogs/pending', label: 'APPROVALS' },
]

const EMPLOYEE_NAV = [
  { to: '/my-assignments',  label: 'ASSIGNMENTS' },
  { to: '/my-worklogs',     label: 'WORKLOGS' },
  { to: '/my-availability', label: 'AVAILABILITY' },
]

const HR_NAV = [
  { to: '/hr/employees', label: 'EMPLOYEES' },
  { to: '/hr/users',     label: 'USERS' },
  { to: '/hr/roles',     label: 'ROLES' },
  { to: '/hr/skills',    label: 'SKILLS' },
]

const FINANCE_NAV = [
  { to: '/finance/worklogs',   label: 'WORKLOGS' },
  { to: '/finance/invoices',   label: 'INVOICES' },
  { to: '/finance/audit',      label: 'AUDITOR · AI' },
  { to: '/finance/milestones', label: 'MILESTONES' },
]

// Read-only across the modules an auditor is entitled to see.
const AUDITOR_NAV = [
  { to: '/contracts',     label: 'CONTRACTS' },
  { to: '/finance/audit', label: 'INVOICE AUDIT' },
]

function buildNav({ isHR, isFinance, isManager, isEmployee, isAdmin, isAuditor }) {
  const combined = []
  // A platform admin sees every module, in the order work flows through them.
  if (isAdmin) {
    combined.push(...MANAGER_NAV, ...HR_NAV, ...FINANCE_NAV, ...EMPLOYEE_NAV)
  } else {
    if (isHR) combined.push(...HR_NAV)
    if (isManager) combined.push(...MANAGER_NAV)
    if (isFinance) combined.push(...FINANCE_NAV)
    if (isAuditor) combined.push(...AUDITOR_NAV)
    if (isEmployee) combined.push(...EMPLOYEE_NAV)
  }
  const seen = new Set()
  return combined.filter((n) => (seen.has(n.to) ? false : seen.add(n.to)))
}

function activeBadge({ isHR, isFinance, isManager, isEmployee, isAdmin, isAuditor }) {
  const badges = []
  if (isAdmin) badges.push('ADMIN')
  if (isHR) badges.push('HR')
  if (isManager) badges.push('DELIVERY')
  if (isFinance) badges.push('FINANCE')
  if (isAuditor) badges.push('AUDIT')
  if (isEmployee) badges.push('CONTRACTOR')
  return badges.join(' · ')
}

export default function Shell({ children }) {
  const auth = useAuth()
  const { user, logout } = auth
  const navigate = useNavigate()
  const nav = buildNav(auth)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      <nav style={{
        width: 200,
        minWidth: 200,
        background: '#010b13',
        borderRight: '1px solid #1e3a4a',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        flexShrink: 0,
      }}>
        <div style={{ padding: '20px 16px 24px', borderBottom: '1px solid #1e3a4a' }}>
          <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: '#ff6b00' }}>
            WORKLEDGER AI
          </div>
          <div style={{ fontSize: 10, color: '#7a9ab0', letterSpacing: '0.08em', marginTop: 2 }}>
            {activeBadge(auth)} · {user?.username?.toUpperCase()}
          </div>
        </div>

        <div style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/contracts'}
              style={({ isActive }) => ({
                display: 'block',
                padding: '9px 16px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                fontFamily: 'ui-monospace, Consolas, monospace',
                textDecoration: 'none',
                color: isActive ? '#ff6b00' : '#7a9ab0',
                borderLeft: isActive ? '2px solid #ff6b00' : '2px solid transparent',
                background: isActive ? '#ff6b0010' : 'transparent',
                transition: 'all 0.1s',
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3a4a' }}>
          <button
            onClick={handleLogout}
            style={{
              background: 'none',
              border: '1px solid #1e3a4a',
              color: '#7a9ab0',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontFamily: 'ui-monospace, Consolas, monospace',
              padding: '6px 10px',
              borderRadius: 2,
              width: '100%',
              textAlign: 'left',
            }}
          >
            SIGN OUT
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: '#010b13' }}>
        {children}
      </main>
    </div>
  )
}
