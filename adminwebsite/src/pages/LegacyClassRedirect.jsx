import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { exams as examsApi } from '../api.js'
import { ErrorState, LoadingState } from '../components/ui.jsx'

/** Old portal links (`/boards/cbse/class/9`) open that board's latest draft, or its published syllabus, at that class. */
export function LegacyClassRedirect() {
  const { code, cls } = useParams()
  const [target, setTarget] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    examsApi
      .versions(code)
      .then((versions) => {
        const version = versions.find((v) => v.status === 'draft') ?? versions.find((v) => v.status === 'published') ?? versions[0]
        setTarget(version ? `/syllabi/${version.id}?level=${encodeURIComponent(cls)}` : `/exams/${code}`)
      })
      .catch((caught) => setError(caught.message))
  }, [code, cls])
  if (target) return <Navigate to={target} replace />
  return error ? (
    <>
      <ErrorState error={error} />
      <Link to="/exams">All exams</Link>
    </>
  ) : (
    <LoadingState />
  )
}
