import { cloneElement, isValidElement, useEffect, useId, useState } from 'react'

export function ErrorText({ children }) {
  return children ? (
    <p className="error" role="alert">
      {children}
    </p>
  ) : null
}

/** A button that asks "Sure?" on the first click and acts on the second. For small, undoable actions. */
export function ConfirmButton({ children, confirmLabel = 'Click again to confirm', onConfirm, className = 'btn danger', disabled }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}

export function Dot({ color, size = 12 }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} aria-hidden="true" />
}

const PATHS = {
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  chevron: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l4 4 10-10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  back: 'M15 18l-6-6 6-6',
}

export function Icon({ name, size = 16, filled = false, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={name === 'grip' || name === 'more' ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Badge({ tone = 'neutral', children, title }) {
  return (
    <span className={`badge tone-${tone}`} title={title}>
      {children}
    </span>
  )
}

const STATUS = {
  draft: { tone: 'warning', label: 'Draft' },
  published: { tone: 'success', label: 'Published' },
  archived: { tone: 'neutral', label: 'Archived' },
}

export function StatusBadge({ status }) {
  const { tone, label } = STATUS[status] ?? { tone: 'neutral', label: status }
  return <Badge tone={tone}>{label}</Badge>
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />
}

/** Placeholder rows while something loads. */
export function LoadingState({ rows = 3, label = 'Loading' }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="error-state" role="alert">
      <span>{error}</span>
      {onRetry ? (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

export function PageHead({ title, lead, actions, crumbs }) {
  return (
    <>
      {crumbs ? <nav className="crumbs">{crumbs}</nav> : null}
      <div className="page-head">
        <div className="grow">
          <h1>{title}</h1>
          {lead ? <p className="muted">{lead}</p> : null}
        </div>
        {actions ? <div className="row">{actions}</div> : null}
      </div>
    </>
  )
}

/** A labelled control. The hint or error is linked with aria-describedby, not read as the label. */
export function Field({ label, hint, error, children, className = '' }) {
  const id = useId()
  const note = error || hint
  const control = isValidElement(children) && note ? cloneElement(children, { 'aria-describedby': `${id}-note`, ...(error ? { 'aria-invalid': true } : {}) }) : children
  return (
    <div className={`field ${className}`}>
      <label>
        <span>{label}</span>
        {control}
      </label>
      {note ? (
        <small id={`${id}-note`} className={error ? 'error' : 'muted'}>
          {note}
        </small>
      ) : null}
    </div>
  )
}

/** An on/off switch with a label. */
export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`toggle${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-text">
        {label}
        {hint ? <small className="muted">{hint}</small> : null}
      </span>
    </label>
  )
}
