import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const S = {
  page: {
    minHeight: '100vh', background: '#010b13',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    width: 380, background: '#0d1b2a',
    border: '1px solid #1e3a4a', borderRadius: 4, padding: '40px 36px',
  },
  wordmark: {
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 20,
    fontWeight: 700, letterSpacing: '0.14em', color: '#ff6b00',
    textAlign: 'center', marginBottom: 8,
  },
  sub: {
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 10,
    color: '#7a9ab0', letterSpacing: '0.1em', textAlign: 'center', marginBottom: 32,
  },
  label: {
    display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
    color: '#7a9ab0', fontFamily: 'ui-monospace, Consolas, monospace',
    marginBottom: 6, textTransform: 'uppercase',
  },
  field: { marginBottom: 18 },
  btn: {
    width: '100%', background: '#ff6b00', border: 'none', borderRadius: 2,
    color: '#010b13', fontFamily: 'ui-monospace, Consolas, monospace',
    fontWeight: 700, fontSize: 12, letterSpacing: '0.1em',
    padding: '10px 0', cursor: 'pointer', marginTop: 8,
    transition: 'opacity 0.12s',
  },
  err: {
    padding: '10px 14px', background: '#ef444415', color: '#ef4444',
    borderLeft: '2px solid #ef4444', marginBottom: 20,
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, borderRadius: 2,
  },
}

// Where each role starts work. Ordered so that a user holding several roles
// lands on the broadest one they have.
const LANDING = [
  ['PLATFORM_ADMIN', '/dashboard'],
  ['MANAGER', '/dashboard'],
  ['HR_MANAGER', '/hr/employees'],
  ['FINANCE_MANAGER', '/finance/invoices'],
  ['AUDITOR', '/finance/audit'],
  ['EMPLOYEE', '/my-assignments'],
]

function landingFor(roles) {
  const match = LANDING.find(([role]) => roles.includes(role))
  return match ? match[1] : '/login'
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await login(username, password)
      navigate(landingFor(user.roles ?? []), { replace: true })
    } catch (err) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.wordmark}>WORKLEDGER AI</div>
        <div style={S.sub}>CONTINGENT WORKFORCE INTELLIGENCE</div>

        {error && <div style={S.err}>ERROR: {error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={S.field}>
            <label style={S.label}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div style={S.field}>
            <label style={S.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? 'AUTHENTICATING...' : 'SIGN IN'}
          </button>
        </form>
      </div>
    </div>
  )
}
