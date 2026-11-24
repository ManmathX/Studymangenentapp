import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { BoardsPage } from './pages/BoardsPage.jsx'
import { ClassPage } from './pages/ClassPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'

export default function App() {
  const { user, logout } = useAuth()
  if (!user) return <LoginPage />
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Syllabus Admin
        </Link>
        <div className="topbar-right">
          <span className="muted small">{user.email}</span>
          <button className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<BoardsPage />} />
          <Route path="/boards/:code/class/:cls" element={<ClassPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
