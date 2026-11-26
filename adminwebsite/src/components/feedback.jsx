import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Icon } from './ui.jsx'

/**
 * A modal dialog on the native <dialog> element, which traps focus and closes on Escape.
 * Mount it only while it should be open.
 */
export function Dialog({ title, onClose, children, footer, wide = false, busy = false }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="btn icon ghost" onClick={onClose} disabled={busy} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer ? <div className="dialog-foot">{footer}</div> : null}
    </dialog>
  )
}

const FeedbackContext = createContext(null)

/** Provides `confirm()` dialogs and `toast()` messages to the whole portal. */
export function FeedbackProvider({ children }) {
  const [request, setRequest] = useState(null)
  const [toasts, setToasts] = useState([])

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setRequest({ ...options, resolve })
      }),
    [],
  )

  const toast = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((list) => [...list.slice(-3), { id, message, tone }])
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), tone === 'error' ? 7000 : 4000)
  }, [])

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast])
  const finish = (answer) => {
    request?.resolve(answer)
    setRequest(null)
  }

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {request ? <ConfirmDialog request={request} onAnswer={finish} /> : null}
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast tone-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>
            {item.message}
            <button type="button" className="btn icon ghost" aria-label="Dismiss" onClick={() => setToasts((list) => list.filter((t) => t.id !== item.id))}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

function ConfirmDialog({ request, onAnswer }) {
  const { title, message, confirmLabel = 'Confirm', tone = 'danger', typeToConfirm, details } = request
  const [typed, setTyped] = useState('')
  const ready = !typeToConfirm || typed.trim() === typeToConfirm
  return (
    <Dialog
      title={title}
      onClose={() => onAnswer(false)}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={() => onAnswer(false)}>
            Cancel
          </button>
          <button type="button" className={`btn ${tone === 'danger' ? 'danger-solid' : 'primary'}`} disabled={!ready} onClick={() => onAnswer(true)} autoFocus={!typeToConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {message ? <p>{message}</p> : null}
      {details?.length ? (
        <ul className="compact-list">
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {typeToConfirm ? (
        <label className="field">
          <span>
            Type <code>{typeToConfirm}</code> to confirm
          </span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
        </label>
      ) : null}
    </Dialog>
  )
}

/** `const confirm = useConfirm(); if (await confirm({ title, message })) …` */
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(FeedbackContext).confirm

/** `toast('Saved')` or `toast('Could not save', 'error')`. */
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(FeedbackContext).toast
