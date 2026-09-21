export default function Btn({ children, onClick, type = 'button', variant = 'primary', disabled, small }) {
  const base = {
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    borderRadius: 2,
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontWeight: 700,
    letterSpacing: '0.08em',
    fontSize: small ? 10 : 11,
    padding: small ? '4px 10px' : '7px 16px',
    transition: 'opacity 0.12s',
    opacity: disabled ? 0.45 : 1,
    whiteSpace: 'nowrap',
  }
  const styles = {
    primary:  { ...base, background: '#ff6b00', color: '#010b13' },
    danger:   { ...base, background: '#ef4444', color: '#fff' },
    ghost:    { ...base, background: 'none', color: '#7a9ab0', border: '1px solid #1e3a4a' },
    approve:  { ...base, background: '#00c85120', color: '#00c851', border: '1px solid #00c85135' },
    reject:   { ...base, background: '#ef444420', color: '#ef4444', border: '1px solid #ef444435' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={styles[variant] ?? styles.primary}>
      {children}
    </button>
  )
}
