import { useEffect, useRef } from 'react'
import Icon from './Icon'

/**
 * Side sheet on desktop, bottom sheet on phones (the switch is pure CSS).
 * Escape closes it, focus moves into it on open, and the page behind stops
 * scrolling while it is up.
 */
export default function Drawer({ open, onClose, title, subtitle, children, footer }) {
  const panel = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(
      () =>
        panel.current
          ?.querySelector('.drawer-body input, .drawer-body select, .drawer-body textarea')
          ?.focus({ preventScroll: true }),
      80,
    )
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
      clearTimeout(t)
    }
  }, [open, onClose])

  return (
    <>
      <div className={`drawer-backdrop${open ? ' open' : ''}`} onClick={onClose} />
      <aside
        ref={panel}
        className={`drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="drawer-head">
          <div className="grow">
            <h2 className="t-h3">{title}</h2>
            {subtitle && <div className="t-sm t-mute mt-4">{subtitle}</div>}
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">{open && children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  )
}
