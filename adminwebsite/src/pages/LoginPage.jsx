import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import { ErrorText } from '../components/ui.jsx'
import { useAction } from '../hooks.js'

export function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const submit = useAction(() => login(email.trim(), password))

  return (
    <div className="login">
      <form
        className="card login-card"
        onSubmit={(event) => {
          event.preventDefault()
          submit.run()
        }}
      >
        <span className="brand-mark large" aria-hidden="true" />
        <h1>Syllabus Admin</h1>
        <p className="muted">Manage boards, classes, subjects and chapters for the Study Planner app.</p>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <ErrorText>{submit.error}</ErrorText>
        <button className="btn primary block" disabled={submit.busy}>
          {submit.busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small">Only admin accounts can sign in. Create the first one with <code>npm run create-admin</code> in <code>backend/</code>.</p>
      </form>
    </div>
  )
}
