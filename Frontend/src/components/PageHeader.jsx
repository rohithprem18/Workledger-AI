/** Page title block: mono eyebrow, tight display heading, supporting line, actions. */
export default function PageHeader({ eyebrow, title, subtitle, action, children }) {
  return (
    <header className="page-header">
      <div className="grow">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="t-h1">{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {(action || children) && <div className="page-actions">{action}{children}</div>}
    </header>
  )
}
