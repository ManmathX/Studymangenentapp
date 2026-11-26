import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { ROLES } from './api.js'
import { useAuth } from './auth.jsx'
import { CategoriesPage } from './pages/CategoriesPage.jsx'
import { DashboardPage } from './pages/DashboardPage.jsx'
import { ExamDetailPage } from './pages/ExamDetailPage.jsx'
import { ExamFormPage } from './pages/ExamFormPage.jsx'
import { ExamsPage } from './pages/ExamsPage.jsx'
import { LegacyClassRedirect } from './pages/LegacyClassRedirect.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { SyllabusPage } from './pages/SyllabusPage.jsx'
import { TeamPage } from './pages/TeamPage.jsx'

export default function App() {
  const { user, logout, can } = useAuth()
  if (!user) return <LoginPage />
  const navClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">Exam Admin</span>
        </Link>
        <nav className="nav" aria-label="Sections">
          <NavLink to="/" end className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/exams" className={navClass}>
            Exams
          </NavLink>
          <NavLink to="/categories" className={navClass}>
            Categories
          </NavLink>
          {can('users:manage') ? (
            <NavLink to="/team" className={navClass}>
              Team
            </NavLink>
          ) : null}
        </nav>
        <div className="topbar-right">
          <span className="muted small who" title={user.email}>
            {user.email} · {ROLES.find((role) => role.value === user.role)?.label ?? user.role}
          </span>
          <button className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/exams" element={<ExamsPage />} />
          <Route path="/exams/new" element={<ExamFormPage />} />
          <Route path="/exams/:code" element={<ExamDetailPage />} />
          <Route path="/exams/:code/edit" element={<ExamFormPage />} />
          <Route path="/syllabi/:id" element={<SyllabusPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/team" element={can('users:manage') ? <TeamPage /> : <Navigate to="/" replace />} />
          {/* Bookmarks from the board-only portal. */}
          <Route path="/boards/:code/class/:cls" element={<LegacyClassRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
