import { Link, useSearchParams } from 'react-router-dom'
import { categories as categoriesApi, dashboard as dashboardApi } from '../api.js'
import { EmptyState, ErrorState, LoadingState, PageHead } from '../components/ui.jsx'
import { formatDate, plural } from '../format.js'
import { useLoad } from '../hooks.js'

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const filters = { category: params.get('category') ?? '', status: params.get('status') ?? '', year: params.get('year') ?? '' }
  const overview = useLoad(() => dashboardApi.get(filters), [filters])
  const categories = useLoad(categoriesApi.list, [])
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const data = overview.data
  const examsLink = (extra = {}) => `/exams?${new URLSearchParams(Object.entries({ ...filters, ...extra }).filter(([, v]) => v)).toString()}`

  return (
    <>
      <PageHead title="Dashboard" lead="Boards, competitive exams and their syllabi at a glance." />
      <div className="filters" role="group" aria-label="Filters">
        <label className="field">
          <span>Category</span>
          <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">All categories</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.code} value={category.code}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Active and inactive</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="field">
          <span>Academic year</span>
          <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)}>
            <option value="">Every year</option>
            {(data?.years ?? []).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorState error={overview.error} onRetry={overview.reload} />
      {!data && overview.loading ? <LoadingState rows={4} /> : null}
      {data ? (
        <>
          <div className="stat-grid">
            <Stat label="Total boards" value={data.totals.boards} to={examsLink()} hint="Exams in school-board categories" />
            <Stat label="Competitive exams" value={data.totals.competitive} to={examsLink()} />
            <Stat label="Active exams" value={data.totals.active} to={examsLink({ status: 'active' })} hint={`${data.totals.inactive} inactive`} />
            <Stat label="Subjects" value={data.content.subjects} hint="In published syllabi" />
            <Stat label="Chapters" value={data.content.chapters} hint={plural(data.content.units, 'unit')} />
            <Stat label="Topics" value={data.content.topics} hint={plural(data.content.subtopics, 'subtopic')} />
            <Stat label="Draft syllabi" value={data.totals.draftSyllabi} tone="warning" />
            <Stat label="Published syllabi" value={data.totals.publishedSyllabi} tone="success" />
          </div>

          <div className="two-col">
            <section className="section">
              <h2>By category</h2>
              <div className="card flush">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="num">Exams</th>
                      <th className="num">Active</th>
                      <th className="num">Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((row) => (
                      <tr key={row.code}>
                        <td>
                          <Link to={`/exams?category=${row.code}`}>{row.name}</Link>
                          {row.group === 'board' ? <span className="muted small"> · boards</span> : null}
                        </td>
                        <td className="num">{row.exams}</td>
                        <td className="num">{row.active}</td>
                        <td className="num">{row.published}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="section">
              <h2>Drafts in progress</h2>
              {data.recentDrafts.length ? (
                <div className="card flush list">
                  {data.recentDrafts.map((draft) => (
                    <Link key={draft.id} to={`/syllabi/${draft.id}`} className="list-link">
                      <div className="grow">
                        <strong>{draft.examName}</strong>
                        <div className="muted small">
                          {draft.academicYear} · v{draft.version} · {plural(draft.counts.chapters, 'chapter')}, {plural(draft.counts.topics, 'topic')}
                        </div>
                      </div>
                      <span className="muted small">{formatDate(draft.updatedAt)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="No drafts">Start one from an exam’s page to change its syllabus.</EmptyState>
              )}
            </section>
          </div>
        </>
      ) : null}
    </>
  )
}

function Stat({ label, value, hint, to, tone }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` tone-text-${tone}` : ''}`}>{value.toLocaleString()}</span>
      {hint ? <span className="muted small">{hint}</span> : null}
    </>
  )
  return to ? (
    <Link to={to} className="card stat link">
      {body}
    </Link>
  ) : (
    <div className="card stat">{body}</div>
  )
}
