import Icon from './Icon'

export * from './format'

/* ------------------------------------------------------------- building */

export function Card({ children, className = '', pad, ...rest }) {
  const padding = pad === 'sm' ? ' card-pad-sm' : pad ? ' card-pad' : ''
  return (
    <div className={`card${padding} ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, eyebrow, action }) {
  return (
    <div className="card-header">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="t-label">{title}</div>
        {subtitle && <div className="t-sm t-mute mt-4">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

export function Section({ title, eyebrow, action, children, className = '' }) {
  return (
    <section className={`section ${className}`}>
      {(title || action) && (
        <div className="section-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="t-h2">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Alert({ tone = 'error', children, onClose }) {
  if (!children) return null
  const icon = { error: 'alert', warning: 'alert', success: 'checkCircle', info: 'info' }[tone]
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} />
      <div className="grow">{children}</div>
      {onClose && (
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Dismiss">
          <Icon name="x" />
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon = 'layers', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <div className="t-label">{title}</div>
      {children && <p>{children}</p>}
      {action && <div className="mt-12">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, foot, tone }) {
  return (
    <Card className="stat">
      <div className="eyebrow">{label}</div>
      <div className={`stat-value${tone ? ` t-${tone}` : ''}`}>{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </Card>
  )
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`tab${value === option.value ? ' active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="t-mute"> {option.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%', style }) {
  return <div className="skeleton" style={{ height, width, ...style }} />
}

export function LoadingRows({ rows = 4 }) {
  return (
    <div className="stack gap-12 card-pad">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={18} width={`${90 - i * 12}%`} />
      ))}
    </div>
  )
}

/**
 * A table on desktop and a stack of cards on phones.
 *
 * `columns`: [{ key, header, render?(row), className?, primary?, hideOnMobile? }]
 * The `primary` column becomes the card title on mobile; the rest become
 * label/value rows. `actions(row)` renders in a trailing column / card footer.
 */
export function DataTable({ columns, rows, rowKey = 'id', actions, onRowClick, empty }) {
  if (!rows || rows.length === 0) {
    return empty ?? null
  }
  const cell = (column, row) => (column.render ? column.render(row) : row[column.key] ?? '—')
  const primary = columns.find((c) => c.primary) ?? columns[0]

  return (
    <>
      <div className="table-wrap dt-table">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.align === 'right' ? 't-right' : ''}>
                  {column.header}
                </th>
              ))}
              {actions && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={[
                      column.primary ? 'cell-strong' : '',
                      column.align === 'right' ? 't-right t-num' : '',
                      column.className ?? '',
                    ].join(' ')}
                  >
                    {cell(column, row)}
                  </td>
                ))}
                {actions && (
                  <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="cluster end">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dt-cards">
        {rows.map((row) => (
          <div
            key={row[rowKey]}
            className="dt-card"
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={onRowClick ? { cursor: 'pointer' } : undefined}
          >
            <div className="dt-card-title">{cell(primary, row)}</div>
            {columns
              .filter((column) => column !== primary && !column.hideOnMobile)
              .map((column) => (
                <div key={column.key} className="dt-card-row">
                  <span className="t-sm t-mute">{column.header}</span>
                  <span className={column.align === 'right' ? 't-num' : ''}>{cell(column, row)}</span>
                </div>
              ))}
            {actions && (
              <div className="dt-card-actions" onClick={(e) => e.stopPropagation()}>
                {actions(row)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
