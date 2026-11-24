import { useEffect, useState } from 'react'

export function ErrorText({ children }) {
  return children ? (
    <p className="error" role="alert">
      {children}
    </p>
  ) : null
}

/** A button that asks "Sure?" on the first click and acts on the second. */
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
