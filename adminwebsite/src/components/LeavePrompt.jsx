import { Dialog } from './feedback.jsx'

/** Asks before leaving a page with unsaved changes (pair with `useUnsavedChanges`). */
export function LeavePrompt({ blocker, message = 'Your changes on this page are not saved yet.' }) {
  if (blocker?.state !== 'blocked') return null
  return (
    <Dialog
      title="Leave without saving?"
      onClose={() => blocker.reset()}
      footer={
        <>
          <button type="button" className="btn" onClick={() => blocker.reset()} autoFocus>
            Stay
          </button>
          <button type="button" className="btn danger-solid" onClick={() => blocker.proceed()}>
            Leave and discard
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Dialog>
  )
}
