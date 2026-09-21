import Icon from './Icon'

/**
 * Button.
 *
 * Two shapes, by context, per the Geist system: 6px squares for in-app
 * controls (the default) and full pills for the few marketing-style CTAs
 * (`pill`). Legacy variant names (`approve`, `reject`) still map, so older
 * call sites keep working.
 */
const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  approve: 'btn-success',
  success: 'btn-success',
  reject: 'btn-reject',
}

export default function Btn({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  loading,
  small,
  size,
  pill,
  block,
  icon,
  iconRight,
  title,
  className = '',
  ...rest
}) {
  const classes = [
    'btn',
    VARIANTS[variant] ?? VARIANTS.primary,
    small || size === 'sm' ? 'btn-sm' : '',
    size === 'lg' ? 'btn-lg' : '',
    pill ? 'btn-pill' : '',
    block ? 'btn-block' : '',
    !children && icon ? 'btn-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={classes}
      title={title}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" /> : icon && <Icon name={icon} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} />}
    </button>
  )
}
