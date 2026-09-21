export default function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '28px 32px 20px', borderBottom: '1px solid #1e3a4a',
    }}>
      <div>
        <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#7a9ab0', marginBottom: 4 }}>
          WORKLEDGER AI
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#f0f2f5', letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        {subtitle && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#7a9ab0', fontFamily: 'ui-monospace, Consolas, monospace' }}>
            {subtitle}
          </div>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
