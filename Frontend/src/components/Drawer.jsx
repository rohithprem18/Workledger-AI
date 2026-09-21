import { useEffect } from 'react'

export default function Drawer({ open, onClose, title, children, width = 480 }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(1,11,19,0.7)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          zIndex: 40, transition: 'opacity 0.18s',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width,
        background: '#0d1b2a', borderLeft: '1px solid #1e3a4a',
        transform: open ? 'translateX(0)' : `translateX(${width}px)`,
        transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 50, display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #1e3a4a', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#7a9ab0' }}>
            {title}
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#7a9ab0', cursor: 'pointer',
            fontSize: 18, lineHeight: 1, padding: 4,
          }}>×</button>
        </div>
        <div style={{ padding: 20, flex: 1 }}>{children}</div>
      </div>
    </>
  )
}
