import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { categories as categoriesApi, dashboard as dashboardApi, exams as examsApi } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ExamLogo } from '../components/ExamLogo.jsx'
import { useConfirm, useToast } from '../components/feedback.jsx'
import { SortableList } from '../components/Sortable.jsx'
import { Badge, EmptyState, ErrorState, Icon, LoadingState, PageHead, StatusBadge } from '../components/ui.jsx'
import { plural, versionLabel } from '../format.js'
import { useAction, useDebounced, useLoad } from '../hooks.js'

const PAGE_SIZE = 20

export function ExamsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounced(search.trim())
  const filters = { category: params.get('category') ?? '', status: params.get('status') ?? '', year: params.get('year') ?? '' }
  const page = Number(params.get('page') ?? 1)
  const ordering = Boolean(filters.category && !filters.status && !filters.year && !q)
  const list = useLoad(() => examsApi.list({ ...filters, q, page: ordering ? 1 : page, limit: ordering ? 100 : PAGE_SIZE }), [filters, q, page, ordering])
  const categories = useLoad(categoriesApi.list, [])
  const years = useLoad(() => dashboardApi.get({}).then((data) => data.years), [])
  const writable = can('catalog:write')

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }

  const reorder = useAction(async (items) => {
    list.setData((current) => ({ ...current, items }))
    await examsApi.reorder(items.map((exam) => exam.code))
    toast('Order saved. Students see the new order within a minute.')
  })
  const toggle = useAction(async (exam) => {
    await examsApi.update(exam.code, { isActive: !exam.isActive })
    toast(`${exam.name} is now ${exam.isActive ? 'hidden from students' : 'active'}.`)
    list.reload()
  })
  const loadStandard = useAction(async () => {
    const ok = await confirm({
      title: 'Load the standard CBSE and ICSE syllabus?',
      message: 'Missing subjects, chapters and book names for classes 6–12 are added to a draft of each board (made from the published version if there is none). Your edits are kept. Nothing changes for students until you publish the drafts.',
      confirmLabel: 'Load into drafts',
      tone: 'primary',
    })
    if (!ok) return
    const result = await examsApi.loadStandard()
    toast(`Added ${plural(result.added, 'subject')} and updated ${plural(result.updated, 'subject')}. Review the drafts, then publish.`)
    list.reload()
  })

  const items = list.data?.items ?? []
  const meta = list.data?.meta
  const error = list.error || reorder.error || toggle.error || loadStandard.error

  return (
    <>
      <PageHead
        title="Exams"
        lead="School boards and competitive exams students can pick. An exam reaches students once it is active and has a published syllabus."
        actions={
          writable ? (
            <>
              <button className="btn" onClick={loadStandard.run} disabled={loadStandard.busy}>
                {loadStandard.busy ? 'Loading…' : 'Load standard CBSE/ICSE'}
              </button>
              <button className="btn" onClick={() => navigate('/exams/new?kind=state-board')}>
                <Icon name="plus" /> Add state board
              </button>
              <button className="btn primary" onClick={() => navigate('/exams/new')}>
                <Icon name="plus" /> Add exam
              </button>
            </>
          ) : null
        }
      />
      <div className="filters" role="search">
        <label className="field grow">
          <span>Search</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, short name or code" />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">All</option>
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
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="field">
          <span>Academic year</span>
          <select value={filters.year} onChange={(e) => setFilter('year', e.target.value)}>
            <option value="">Any</option>
            {(years.data ?? []).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        {ordering && writable ? 'Drag exams by their handle to set the order students see them in.' : writable ? 'Pick a category (with no other filter) to drag exams into order.' : null}
      </p>

      <ErrorState error={error} onRetry={list.error ? list.reload : undefined} />
      {!list.data && list.loading ? <LoadingState rows={5} /> : null}
      {list.data && !items.length ? (
        <EmptyState
          title={q || filters.category || filters.status || filters.year ? 'No exams match' : 'No exams yet'}
          action={
            writable ? (
              <Link className="btn primary" to="/exams/new">
                Add an exam
              </Link>
            ) : null
          }
        >
          {q ? `Nothing matches “${q}”.` : 'Try other filters.'}
        </EmptyState>
      ) : null}
      {items.length ? (
        <div className={`card flush exam-list${list.loading ? ' stale' : ''}`}>
          <SortableList
            items={items}
            getId={(exam) => exam.code}
            disabled={!ordering || !writable || reorder.busy}
            onReorder={reorder.run}
            renderItem={(exam, handle) => <ExamRow exam={exam} handle={handle} writable={writable} onToggle={() => toggle.run(exam)} busy={toggle.busy} />}
          />
        </div>
      ) : null}
      {meta && !ordering && (meta.page > 1 || meta.hasNext) ? (
        <div className="pager">
          <button className="btn" disabled={meta.page <= 1} onClick={() => setFilter('page', String(meta.page - 1))}>
            Previous
          </button>
          <span className="muted small">
            Page {meta.page} of {Math.max(1, Math.ceil(meta.total / meta.limit))} · {plural(meta.total, 'exam')}
          </span>
          <button className="btn" disabled={!meta.hasNext} onClick={() => setFilter('page', String(meta.page + 1))}>
            Next
          </button>
        </div>
      ) : null}
    </>
  )
}

function ExamRow({ exam, handle, writable, onToggle, busy }) {
  const { published, drafts, latestDraft } = exam.syllabus
  const levels = exam.structure.levels
  const levelText = !levels.length ? 'One syllabus' : levels.every((level) => level.grade) ? `Class ${levels[0].grade}–${levels[levels.length - 1].grade}` : levels.map((level) => level.name).join(', ')
  return (
    <div className="exam-row">
      {handle ?? <span className="drag-space" />}
      <ExamLogo exam={exam} size={38} />
      <div className="grow">
        <Link to={`/exams/${exam.code}`} className="strong-link">
          {exam.name}
        </Link>
        <div className="muted small">
          <code>{exam.code}</code> · {exam.categoryName} · {levelText}
        </div>
      </div>
      <div className="exam-status">
        {published ? (
          <span title={`${published.counts.chapters} chapters, ${published.counts.topics} topics`}>
            <StatusBadge status="published" /> <span className="small">{versionLabel(published)}</span>
          </span>
        ) : (
          <Badge tone="neutral">Not published</Badge>
        )}
        {drafts ? (
          <Link to={`/syllabi/${latestDraft.id}`} className="small">
            {plural(drafts, 'draft')}
          </Link>
        ) : null}
      </div>
      <label className="switch" title={exam.isActive ? 'Shown to students' : 'Hidden from students'}>
        <input type="checkbox" role="switch" checked={exam.isActive} disabled={!writable || busy} onChange={onToggle} aria-label={`${exam.name} active`} />
        <span className="toggle-track" aria-hidden="true" />
      </label>
    </div>
  )
}
