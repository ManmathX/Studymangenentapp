import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { download, subjects as subjectsApi, syllabi as syllabiApi } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ExamLogo } from '../components/ExamLogo.jsx'
import { Dialog, useConfirm, useToast } from '../components/feedback.jsx'
import { LeavePrompt } from '../components/LeavePrompt.jsx'
import { NewDraftDialog } from '../components/NewDraftDialog.jsx'
import { SortableList } from '../components/Sortable.jsx'
import { CopyLevelDialog } from '../components/syllabus/CopyLevelDialog.jsx'
import { ImportDialog } from '../components/syllabus/ImportDialog.jsx'
import { SubjectEditor } from '../components/syllabus/SubjectEditor.jsx'
import { Dot, EmptyState, ErrorState, ErrorText, Field, Icon, LoadingState, StatusBadge } from '../components/ui.jsx'
import { formatDate, plural, versionLabel } from '../format.js'
import { useAction, useLoad, useUnsavedChanges } from '../hooks.js'

export function SyllabusPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { can } = useAuth()
  const confirm = useConfirm()
  const toast = useToast()
  const version = useLoad(() => syllabiApi.get(id), [id])
  const data = version.data
  const levelKey = params.get('level') ?? data?.levels[0]?.key ?? ''
  const subjects = useLoad(() => (data ? syllabiApi.subjects(id, levelKey) : Promise.resolve(null)), [id, levelKey, Boolean(data)])
  const [selectedId, setSelectedId] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [dialog, setDialog] = useState(null)
  const blocker = useUnsavedChanges(dirty)
  const onDirty = useCallback((value) => setDirty(value), [])

  const editable = Boolean(data?.editable && can('catalog:write'))
  const list = subjects.data ?? []
  const current = list.find((subject) => subject.id === selectedId) ?? list[0] ?? null
  const exam = data?.examInfo
  const level = data?.levels.find((item) => item.key === levelKey)
  const hasLevels = Boolean(exam?.structure.levels.length)

  const refresh = () => {
    version.reload()
    subjects.reload()
    setGeneration((n) => n + 1)
  }

  const select = async (subject) => {
    if (subject.id === current?.id) return
    if (dirty && !(await confirm({ title: 'Leave without saving?', message: `Your changes to ${current.name} are not saved.`, confirmLabel: 'Discard changes' }))) return
    setDirty(false)
    setSelectedId(subject.id)
  }

  const act = useAction(async (kind) => {
    if (kind === 'publish') {
      if (dirty) throw new Error('Save or discard your changes first.')
      const ok = await confirm({
        title: `Publish ${exam.name} ${versionLabel(data)}?`,
        message: `New students who pick ${exam.name} get this syllabus, and the version published until now (if any) is archived. Students already set up keep their copy.`,
        details: data.levels.filter((item) => item.subjects.length).map((item) => `${item.name || exam.name}: ${plural(item.subjects.length, 'subject')}, ${plural(item.subjects.reduce((n, s) => n + s.counts.chapters, 0), 'chapter')}`),
        confirmLabel: 'Publish',
        tone: 'primary',
      })
      if (!ok) return
      await syllabiApi.publish(id)
      toast(`${exam.name} ${versionLabel(data)} is published.`)
    } else if (kind === 'unpublish') {
      const ok = await confirm({ title: 'Unpublish this syllabus?', message: `It goes back to draft. Until another version is published, new students can’t pick ${exam.name}.`, confirmLabel: 'Unpublish' })
      if (!ok) return
      await syllabiApi.unpublish(id)
      toast('Back to draft.')
    } else if (kind === 'redraft') {
      const result = await syllabiApi.duplicate(id, {})
      toast(`Draft ${versionLabel(result.version)} created from ${versionLabel(data)}.`)
      navigate(`/syllabi/${result.version.id}${levelKey ? `?level=${levelKey}` : ''}`)
      return
    } else if (kind === 'delete') {
      const ok = await confirm({ title: `Delete ${versionLabel(data)}?`, message: `${plural(data.counts.subjects, 'subject')}, ${plural(data.counts.chapters, 'chapter')} and ${plural(data.counts.topics, 'topic')} are deleted for good.`, confirmLabel: 'Delete version' })
      if (!ok) return
      setDirty(false)
      await syllabiApi.remove(id)
      toast(`${versionLabel(data)} deleted.`)
      navigate(`/exams/${data.exam}`)
      return
    }
    version.reload()
  })

  const exportAs = useAction(async (format, onlyLevel) => {
    download(await syllabiApi.exportFile(id, format, onlyLevel ? levelKey : undefined))
  })

  const reorder = useAction(async (ordered) => {
    subjects.setData(ordered)
    subjects.setData(await syllabiApi.reorderSubjects(id, levelKey, ordered.map((subject) => subject.subjectId)))
  })

  const removeSubject = useAction(async () => {
    const counts = current.counts
    const ok = await confirm({
      title: `Delete ${current.name}?`,
      message: `${current.name} and its ${plural(counts.chapters, 'chapter')}, ${plural(counts.topics, 'topic')} are removed from this draft.`,
      confirmLabel: 'Delete subject',
    })
    if (!ok) return
    await subjectsApi.remove(current.id)
    setDirty(false)
    setSelectedId(null)
    toast(`${current.name} deleted.`)
    refresh()
  })

  if (!data)
    return (
      <>
        <nav className="crumbs">
          <Link to="/exams">Exams</Link>
        </nav>
        <ErrorState error={version.error} onRetry={version.reload} />
        {version.loading ? <LoadingState rows={8} /> : null}
      </>
    )

  const status = data.status
  return (
    <>
      <LeavePrompt blocker={blocker} message={`Your changes to ${current?.name ?? 'this subject'} are not saved yet.`} />
      <nav className="crumbs">
        <Link to="/exams">Exams</Link> › <Link to={`/exams/${exam.code}`}>{exam.name}</Link> › {versionLabel(data)}
      </nav>
      <div className="syllabus-head">
        <ExamLogo exam={exam} size={44} />
        <div className="grow">
          <h1>
            {exam.name} syllabus <span className="muted">{versionLabel(data)}</span>
          </h1>
          <div className="row small">
            <StatusBadge status={status} />
            {data.title ? <span>{data.title}</span> : null}
            <span className="muted">
              {plural(data.counts.subjects, 'subject')} · {plural(data.counts.chapters, 'chapter')} · {plural(data.counts.topics, 'topic')} · updated {formatDate(data.updatedAt)}
            </span>
          </div>
        </div>
        <div className="row">
          {editable ? (
            <button className="btn" onClick={() => setDialog('import')} disabled={dirty} title={dirty ? 'Save or discard your changes first' : undefined}>
              <Icon name="upload" /> Import
            </button>
          ) : null}
          <details className="menu">
            <summary className="btn">
              <Icon name="download" /> Export
            </summary>
            <div className="menu-items" role="menu">
              <button type="button" role="menuitem" onClick={() => exportAs.run('csv')}>
                Spreadsheet (CSV)
              </button>
              {hasLevels ? (
                <button type="button" role="menuitem" onClick={() => exportAs.run('csv', true)}>
                  CSV, {level?.name} only
                </button>
              ) : null}
              <button type="button" role="menuitem" onClick={() => exportAs.run('json')}>
                Full backup (JSON)
              </button>
            </div>
          </details>
          {can('catalog:write') ? (
            <button className="btn" onClick={() => setDialog('copy-version')}>
              <Icon name="copy" /> Copy
            </button>
          ) : null}
          {editable ? (
            <button className="btn" onClick={() => setDialog('settings')}>
              Settings
            </button>
          ) : null}
          {can('catalog:publish') && status !== 'published' ? (
            <button className="btn primary" onClick={() => act.run('publish')} disabled={act.busy || dirty}>
              {status === 'archived' ? 'Publish again' : 'Publish'}
            </button>
          ) : null}
          {can('catalog:publish') && status === 'published' ? (
            <button className="btn" onClick={() => act.run('unpublish')} disabled={act.busy}>
              Unpublish
            </button>
          ) : null}
          {can('catalog:publish') && status !== 'published' ? (
            <button className="btn icon ghost danger" onClick={() => act.run('delete')} aria-label="Delete this version" title="Delete this version">
              <Icon name="trash" />
            </button>
          ) : null}
        </div>
      </div>
      <ErrorState error={act.error || exportAs.error || reorder.error || removeSubject.error} />

      {status !== 'draft' ? (
        <div className={`callout ${status === 'published' ? 'tone-success' : 'tone-info'}`}>
          <div className="grow">
            <strong>{status === 'published' ? 'Published: students who set up now get this version.' : 'Archived: an earlier version.'}</strong> Only drafts can be edited.
          </div>
          {can('catalog:write') ? (
            <button className="btn primary" onClick={() => act.run('redraft')} disabled={act.busy}>
              Start a new draft from this
            </button>
          ) : null}
        </div>
      ) : !can('catalog:write') ? (
        <div className="callout tone-info">You can look at this draft; editors and admins can change it.</div>
      ) : null}

      {hasLevels || data.levels.length > 1 ? (
        <div className="tabs" role="tablist" aria-label={exam.structure.levelLabel}>
          {data.levels.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === levelKey}
              className={`tab${item.key === levelKey ? ' active' : ''}${item.subjects.length ? ' loaded' : ''}`}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('level', item.key)
                setParams(next)
                setSelectedId(null)
              }}
            >
              {item.name || 'No level'}
              {item.subjects.length ? <span className="badge">{item.subjects.length}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="editor-layout">
        <aside className="subject-pane" aria-label="Subjects">
          <div className="pane-head">
            <h2>Subjects{level?.name ? ` · ${level.name}` : ''}</h2>
          </div>
          <ErrorState error={subjects.error} onRetry={subjects.reload} />
          {!subjects.data && subjects.loading ? <LoadingState rows={4} /> : null}
          {list.length ? (
            <SortableList
              items={list}
              getId={(subject) => subject.id}
              disabled={!editable || reorder.busy}
              onReorder={reorder.run}
              className="subject-list"
              renderItem={(subject, handle) => (
                <div className={`subject-item${subject.id === current?.id ? ' active' : ''}`}>
                  {handle}
                  <button type="button" className="subject-pick" onClick={() => select(subject)} aria-current={subject.id === current?.id}>
                    <Dot color={subject.color} size={10} />
                    <span className="grow">{subject.name}</span>
                    <span className="muted small" title={`${subject.counts.chapters} chapters, ${subject.counts.topics} topics`}>
                      {subject.counts.chapters}
                    </span>
                  </button>
                </div>
              )}
            />
          ) : null}
          {editable ? <AddSubject syllabusId={id} level={levelKey} onAdded={(created) => {
                refresh()
                setSelectedId(created.id)
              }} /> : null}
          {editable ? (
            <button type="button" className="btn ghost block" onClick={() => setDialog('copy-level')}>
              <Icon name="copy" /> Copy subjects from…
            </button>
          ) : null}
        </aside>
        <section className="tree-pane">
          {subjects.data && !list.length ? (
            <EmptyState title={`No subjects${level?.name ? ` in ${level.name}` : ''} yet`}>{editable ? 'Add a subject on the left, copy them from another class or exam, or import a spreadsheet.' : 'This version has no subjects here.'}</EmptyState>
          ) : null}
          {current ? (
            <SubjectEditor
              key={`${current.id}:${generation}`}
              subject={current}
              exam={exam}
              editable={editable}
              onDirty={onDirty}
              onDelete={removeSubject.run}
              onSaved={(saved) => {
                subjects.setData((all) => all.map((subject) => (subject.id === saved.id ? saved : subject)))
                version.reload()
              }}
            />
          ) : null}
        </section>
      </div>

      {dialog === 'import' ? (
        <ImportDialog
          syllabusId={id}
          exam={exam}
          onClose={() => setDialog(null)}
          onImported={(result) => {
            setDialog(null)
            toast(`Imported: ${result.subjects.added} new and ${result.subjects.updated} updated subjects.`)
            refresh()
          }}
        />
      ) : null}
      {dialog === 'copy-level' ? (
        <CopyLevelDialog
          syllabusId={id}
          exam={exam}
          level={levelKey}
          levelName={level?.name}
          onClose={() => setDialog(null)}
          onCopied={(result) => {
            setDialog(null)
            toast(result.added ? `Copied ${plural(result.added, 'subject')}.` : 'Nothing new to copy: this level already has those subjects.')
            refresh()
          }}
        />
      ) : null}
      {dialog === 'copy-version' ? (
        <NewDraftDialog
          exam={exam}
          source={data}
          onClose={() => setDialog(null)}
          onCreated={(result) => {
            setDialog(null)
            toast(`Draft created with ${plural(result.copied, 'subject')}.`)
            navigate(`/syllabi/${result.version.id}`)
          }}
        />
      ) : null}
      {dialog === 'settings' ? (
        <SettingsDialog
          version={data}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            toast('Saved.')
            version.reload()
          }}
        />
      ) : null}
    </>
  )
}

function AddSubject({ syllabusId, level, onAdded }) {
  const [name, setName] = useState('')
  const add = useAction(async () => {
    const created = await syllabiApi.createSubject(syllabusId, { level, name: name.trim() })
    setName('')
    onAdded(created)
  })
  return (
    <form
      className="add-subject"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) add.run()
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New subject" maxLength={60} aria-label="New subject name" />
      <button className="btn" disabled={add.busy || !name.trim()}>
        Add
      </button>
      <ErrorText>{add.error}</ErrorText>
    </form>
  )
}

function SettingsDialog({ version, onClose, onSaved }) {
  const [title, setTitle] = useState(version.title)
  const [notes, setNotes] = useState(version.notes)
  const [year, setYear] = useState(version.academicYear)
  const save = useAction(async () => {
    if (!/^20\d{2}(-\d{2})?$/.test(year)) throw new Error('Use an academic year like 2026-27 or 2027.')
    await syllabiApi.update(version.id, { title: title.trim(), notes: notes.trim(), ...(year !== version.academicYear ? { academicYear: year } : {}) })
    onSaved()
  })
  return (
    <Dialog
      title="Version settings"
      onClose={onClose}
      busy={save.busy}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={save.run} disabled={save.busy}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Academic year" hint="Changing it gives the draft the next version number for that year">
          <input value={year} onChange={(e) => setYear(e.target.value.trim())} />
        </Field>
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Notes for the team">
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        <ErrorText>{save.error}</ErrorText>
      </div>
    </Dialog>
  )
}
