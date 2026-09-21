import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import Icon, { LogoMark } from '../components/Icon'
import Btn from '../components/Btn'
import { Alert, Field, errorText } from '../components/ui'

// Where each role starts work. Ordered so a user holding several roles lands
// on the broadest one they have.
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

const DEMO_ACCOUNTS = [
  { username: 'manager', role: 'Delivery' },
  { username: 'finance', role: 'Finance' },
  { username: 'hr', role: 'People' },
  { username: 'employee1', role: 'Contractor' },
  { username: 'auditor', role: 'Auditor' },
  { username: 'admin', role: 'Admin' },
]

const FEATURES = [
  {
    icon: 'sparkles',
    title: 'Contract intake with verified citations',
    body: 'Rates, terms, milestones and dates — each checked against the source text.',
  },
  {
    icon: 'scan',
    title: 'Deterministic invoice auditing',
    body: 'Contract, approved work and invoice reconciled before anything is approved.',
  },
  {
    icon: 'shield',
    title: 'Six roles, one ledger',
    body: 'Table-driven access control from onboarding through billing.',
  },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function signIn(user, pass) {
    setError(null)
    setLoading(true)
    try {
      const result = await login(user, pass)
      navigate(landingFor(result.roles ?? []), { replace: true })
    } catch (err) {
      setError(errorText(err, 'Sign-in failed'))
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    signIn(username, password)
  }

  return (
    <div className="auth">
      <section className="auth-hero mesh">
        <div className="brand" style={{ padding: 0 }}>
          <LogoMark />
          <div className="brand-name">
            WorkLedger <span>AI</span>
          </div>
        </div>

        <div className="stack gap-24">
          <div className="eyebrow">Contingent workforce intelligence</div>
          <h1 className="t-display">
            Every invoice, reconciled before it ships.
          </h1>
          <p className="t-body-lg t-body" style={{ maxWidth: 460 }}>
            From vendor onboarding to invoice approval — contracts, approved work and invoices kept
            in agreement, with AI that explains and never decides.
          </p>
        </div>

        <div className="feature-list">
          {FEATURES.map((f) => (
            <div className="feature-item" key={f.title}>
              <span className="feature-dot">
                <Icon name={f.icon} />
              </span>
              <div>
                <div className="t-label">{f.title}</div>
                <div className="t-sm t-body mt-4">{f.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form">
          <h2 className="t-h1">Sign in</h2>
          <p className="t-body mt-8">Use your WorkLedger account, or try a demo role below.</p>

          <form onSubmit={handleSubmit} className="mt-32">
            {error && <Alert>{error}</Alert>}
            <Field label="Username" htmlFor="username">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Btn type="submit" size="lg" block pill loading={loading} className="mt-24">
              Continue
            </Btn>
          </form>

          <div className="row gap-12 mt-32">
            <hr className="divider grow" />
            <span className="eyebrow">Demo accounts</span>
            <hr className="divider grow" />
          </div>
          <div className="demo-grid mt-16">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                type="button"
                className="demo-btn"
                disabled={loading}
                onClick={() => signIn(account.username, 'password')}
              >
                <span className="t-label">{account.role}</span>
                <span className="t-sm mono">{account.username}</span>
              </button>
            ))}
          </div>
          <p className="t-sm t-mute mt-16">
            Demo accounts share the password <span className="mono t-ink">password</span>.
          </p>
        </div>
      </section>
    </div>
  )
}
