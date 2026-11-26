import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { exams as examsApi, syllabi as syllabiApi } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ExamLogo } from '../components/ExamLogo.jsx'
import { useConfirm, useToast } from '../components/feedback.jsx'
import { NewDraftDialog } from '../components/NewDraftDialog.jsx'
import { Badge, EmptyState, ErrorState, Icon, LoadingState, StatusBadge } from '../components/ui.jsx'
import { formatDate, plural, versionLabel } from '../format.js'
import { useAction, useLoad } from '../hooks.js'

export function ExamDetailPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const exam = useLoad(() => examsApi.get(code), [code])
  const versions = useLoad(() => examsApi.versions(code), [code])
  const [dialog, setDialog] = useState(null)
  const reload = () => {
    exam.reload()
    versions.reload()
  }

  const act = useAction(async (kind, version) => {
    const name = exam.data.name
    if (kind === 'publish') {
      const current = (versions.data ?? []).find((v) => v.status === 'published')
      const ok = await confirm({
        title: `Publish ${versionLabel(version)}?`,
        message: `New students who pick ${name} get this syllabus.${current ? ` ${versionLabel(current)} is archived.` : ''} Students already set up keep their copy.`,
        confirmLabel: 'Publish',
        tone: 'primary',
      })
      if (!ok) return
      await syllabiApi.publish(version.id)
      toast(`${versionLabel(version)} is published.`)
    } else if (kind === 'unpublish') {
      const ok = await confirm({
        title: `Unpublish ${versionLabel(version)}?`,
        message: `It goes back to draft. Until another version is published, new students can’t pick ${name}.`,
        confirmLabel: 'Unpublish',
      })
      if (!ok) return
      await syllabiApi.unpublish(version.id)
      toast(`${versionLabel(version)} is a draft again.`)
    } else if (kind === 'delete') {
      const ok = await confirm({
        title: `Delete ${versionLabel(version)}?`,
        message: `Its ${plural(version.counts.subjects, 'subject')}, ${plural(version.counts.chapters, 'chapter')} and ${plural(version.counts.topics, 'topic')} are deleted for good.`,
        confirmLabel: 'Delete version',
      })
      if (!ok) return
      await syllabiApi.remove(version.id)
      toast(`${versionLabel(version)} deleted.`)
    } else if (kind === 'exam') {
      const ok = await confirm({
        title: `Delete ${name}?`,
        message: 'The exam and every syllabus version are deleted for good. Students already set up keep their copy on their phone.',
        typeToConfirm: code,
        confirmLabel: 'Delete exam',
      })
      if (!ok) return
      await examsApi.remove(code)
      toast(`${name} deleted.`)
      navigate('/exams')
      return
    }
    reload()
  })

  if (!exam.data)
    return (
      <>
        <nav className="crumbs">
          <Link to="/exams">Exams</Link>
        </nav>
        <ErrorState error={exam.error} onRetry={exam.reload} />
        {exam.loading ? <LoadingState rows={6} /> : null}
      </>
    )

  const data = exam.data
  const { structure } = data
  const list = versions.data ?? []
  const draft = list.find((v) => v.status === 'draft')

  return (
    <>
      <nav className="crumbs">
        <Link to="/exams">Exams</Link> › <Link to={`/exams?category=${data.category}`}>{data.categoryName}</Link> › {data.shortName}
      </nav>
      <div className="exam-head">
        <ExamLogo exam={data} size={64} />
        <div className="grow">
          <h1>{data.name}</h1>
          <div className="row small">
            <code>{data.code}</code>
            <Badge>{data.categoryName}</Badge>
            {data.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
            {data.syllabus.published ? <span className="muted">Students get {versionLabel(data.syllabus.published)}</span> : <span className="muted">Not published yet: students don’t see it</span>}
          </div>
          {data.description ? <p className="muted">{data.description}</p> : null}
        </div>
        <div className="row">
          {can('catalog:write') ? (
            <Link className="btn" to={`/exams/${code}/edit`}>
              <Icon name="edit" /> Edit exam
            </Link>
          ) : null}
          {can('catalog:publish') ? (
            <button className="btn danger" onClick={() => act.run('exam')} disabled={act.busy}>
              Delete
            </button>
          ) : null}
        </div>
      </div>
      <ErrorState error={act.error} />

      <section className="section">
        <div className="section-head">
          <h2>Syllabus versions</h2>
          {can('catalog:write') ? (
            <button className="btn primary" onClick={() => setDialog({ type: 'new' })}>
              <Icon name="plus" /> New draft
            </button>
          ) : null}
        </div>
        <ErrorState error={versions.error} onRetry={versions.reload} />
        {!versions.data && versions.loading ? <LoadingState /> : null}
        {versions.data && !list.length ? <EmptyState title="No syllabus yet">Start a draft, fill it in, then publish it.</EmptyState> : null}
        {list.length ? (
          <div className="card flush table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th className="num">Subjects</th>
                  <th className="num">Chapters</th>
                  <th className="num">Topics</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((version) => (
                  <tr key={version.id}>
                    <td>
                      <Link to={`/syllabi/${version.id}`} className="strong-link">
                        {versionLabel(version)}
                      </Link>
                      {version.title ? <div className="muted small">{version.title}</div> : null}
                    </td>
                    <td>
                      <StatusBadge status={version.status} />
                    </td>
                    <td className="num">{version.counts.subjects}</td>
                    <td className="num">{version.counts.chapters}</td>
                    <td className="num">{version.counts.topics}</td>
                    <td className="small muted">{formatDate(version.status === 'published' ? version.publishedAt : version.updatedAt)}</td>
                    <td>
                      <div className="row nowrap end">
                        <Link className="btn" to={`/syllabi/${version.id}`}>
                          {version.status === 'draft' && can('catalog:write') ? 'Edit' : 'Open'}
                        </Link>
                        {can('catalog:write') ? (
                          <button className="btn" onClick={() => setDialog({ type: 'copy', source: version })} title="Copy into a new draft of this or another exam">
                            <Icon name="copy" /> Copy
                          </button>
                        ) : null}
                        {can('catalog:publish') && version.status !== 'published' ? (
                          <button className="btn primary" onClick={() => act.run('publish', version)} disabled={act.busy}>
                            Publish
                          </button>
                        ) : null}
                        {can('catalog:publish') && version.status === 'published' ? (
                          <button className="btn" onClick={() => act.run('unpublish', version)} disabled={act.busy}>
                            Unpublish
                          </button>
                        ) : null}
                        {can('catalog:publish') && version.status !== 'published' ? (
                          <button className="btn icon ghost danger" onClick={() => act.run('delete', version)} disabled={act.busy} aria-label={`Delete ${versionLabel(version)}`}>
                            <Icon name="trash" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {draft && can('catalog:write') ? (
          <p className="muted small">
            Editing happens in drafts. <Link to={`/syllabi/${draft.id}`}>Open the latest draft</Link>.
          </p>
        ) : null}
      </section>

      <div className="detail-grid">
        <section className="card">
          <h2>Structure</h2>
          <dl className="facts">
            <dt>{structure.levels.length ? `${structure.levelLabel}s` : 'Levels'}</dt>
            <dd>{structure.levels.length ? structure.levels.map((level) => level.name).join(', ') : 'One syllabus for everyone'}</dd>
            <dt>Hierarchy</dt>
            <dd>{['Subject', structure.useUnits ? structure.unitLabel : null, 'Chapter', structure.useTopics ? 'Topic' : null, structure.useTopics && structure.useSubtopics ? 'Subtopic' : null].filter(Boolean).join(' → ')}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Who it is for</h2>
          <dl className="facts">
            <dt>Conducted by</dt>
            <dd>{data.conductingBody || '—'}</dd>
            <dt>Region</dt>
            <dd>{data.region === 'state' && data.state ? `State: ${data.state}` : data.region}</dd>
            <dt>Classes</dt>
            <dd>{data.targetGrades.length ? data.targetGrades.join(', ') : '—'}</dd>
            <dt>Eligibility</dt>
            <dd>{data.eligibility || '—'}</dd>
            <dt>Languages</dt>
            <dd>{data.languages.join(', ') || '—'}</dd>
          </dl>
        </section>
        {Object.keys(data.settings).length ? (
          <section className="card">
            <h2>Settings</h2>
            <dl className="facts">
              {Object.entries(data.settings).map(([key, value]) => (
                <div key={key} className="fact-pair">
                  <dt>
                    <code>{key}</code>
                  </dt>
                  <dd>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      {dialog ? (
        <NewDraftDialog
          exam={data}
          source={dialog.source ?? null}
          onClose={() => setDialog(null)}
          onCreated={(result) => {
            setDialog(null)
            toast(result.copied ? `Draft created with ${plural(result.copied, 'subject')} copied.` : 'Draft created.')
            navigate(`/syllabi/${result.version.id}`)
          }}
        />
      ) : null}
    </>
  )
}
