import { useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { CLASSES, syllabus } from '../api.js'
import { SubjectEditor } from '../components/SubjectEditor.jsx'
import { ConfirmButton, Dot, ErrorText } from '../components/ui.jsx'
import { useAction, useLoad } from '../hooks.js'

const PALETTE = ['#007AFF', '#34C759', '#FF9500', '#AF52DE', '#FF2D55', '#5AC8FA', '#FFCC00', '#5856D6', '#A2845E', '#30B0C7', '#FF6482', '#64D2FF']

export function ClassPage() {
  const { code, cls: clsParam } = useParams()
  const cls = Number(clsParam)
  const boards = useLoad(syllabus.overview, [])
  const subjects = useLoad(() => syllabus.subjects(code, cls), [code, cls])
  const [openId, setOpenId] = useState(null)
  const board = boards.data?.find((item) => item.code === code)
  const list = subjects.data ?? []

  const move = useAction(async (index, delta) => {
    const ids = list.map((subject) => subject.subjectId)
    const [moved] = ids.splice(index, 1)
    ids.splice(index + delta, 0, moved)
    subjects.setData(await syllabus.reorder(code, cls, ids))
  })
  const remove = useAction(async (subject) => {
    await syllabus.deleteSubject(subject.id)
    if (openId === subject.id) setOpenId(null)
    subjects.reload()
    boards.reload()
  })

  const changed = () => {
    subjects.reload()
    boards.reload()
  }

  return (
    <>
      <nav className="crumbs">
        <Link to="/">Boards</Link> › <span>{board?.name ?? code}</span> › <span>Class {cls}</span>
      </nav>
      <div className="page-head">
        <h1>
          {board?.name ?? code} · Class {cls}
        </h1>
      </div>
      <div className="tabs" role="tablist" aria-label="Class">
        {CLASSES.map((n) => {
          const count = board?.classes.find((row) => row.cls === n)?.subjects ?? 0
          return (
            <NavLink key={n} to={`/boards/${code}/class/${n}`} className={({ isActive }) => `tab${isActive ? ' active' : ''}${count ? ' loaded' : ''}`} onClick={() => setOpenId(null)}>
              {n}
              {count ? <span className="badge">{count}</span> : null}
            </NavLink>
          )
        })}
      </div>

      <ErrorText>{subjects.error || move.error || remove.error}</ErrorText>
      {subjects.loading && !subjects.data ? <p className="muted">Loading…</p> : null}

      {subjects.data ? (
        <section className="section">
          <h2>Subjects</h2>
          {list.length ? (
            <div className="card list">
              {list.map((subject, index) => (
                <div key={subject.id} className="list-item">
                  <div className="subject-row">
                    <Dot color={subject.color} />
                    <div className="grow">
                      <strong>{subject.name}</strong>
                      <div className="muted small">
                        <code>{subject.subjectId}</code> · {subject.chapters.length} chapter{subject.chapters.length === 1 ? '' : 's'}
                        {bookSummary(subject.chapters)}
                        {subject.chapters.length ? '' : ' · hidden from students until it has chapters'}
                      </div>
                    </div>
                    <div className="row">
                      <button className="btn icon" onClick={() => move.run(index, -1)} disabled={index === 0 || move.busy} aria-label={`Move ${subject.name} up`}>
                        ↑
                      </button>
                      <button className="btn icon" onClick={() => move.run(index, 1)} disabled={index === list.length - 1 || move.busy} aria-label={`Move ${subject.name} down`}>
                        ↓
                      </button>
                      <button className="btn" onClick={() => setOpenId(openId === subject.id ? null : subject.id)}>
                        {openId === subject.id ? 'Close' : 'Edit chapters'}
                      </button>
                      <ConfirmButton onConfirm={() => remove.run(subject)} disabled={remove.busy} confirmLabel="Delete subject?">
                        Delete
                      </ConfirmButton>
                    </div>
                  </div>
                  {openId === subject.id ? <SubjectEditor key={subject.id} subject={subject} onSaved={changed} onClose={() => setOpenId(null)} /> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No subjects in this class yet. Add one below, or copy a whole class from another board.</p>
          )}
          <p className="muted small">Changes apply to students who set up from now on. Students already using the app keep the chapters they started with.</p>
        </section>
      ) : null}

      <div className="two-col">
        <NewSubject code={code} cls={cls} count={list.length} onCreated={changed} />
        <CopyClass code={code} cls={cls} boards={boards.data ?? []} onCopied={changed} />
      </div>
    </>
  )
}

function NewSubject({ code, cls, count, onCreated }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[count % PALETTE.length])
  const [chapters, setChapters] = useState('')
  const lines = chapters
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const create = useAction(async () => {
    await syllabus.createSubject(code, cls, { name: name.trim(), color: color.toUpperCase(), chapters: lines.map((line) => ({ name: line, difficulty: 2 })) })
    setName('')
    setChapters('')
    setColor(PALETTE[(count + 1) % PALETTE.length])
    onCreated()
  })
  return (
    <section className="section">
      <h2>Add a subject</h2>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault()
          create.run()
        }}
      >
        <div className="row">
          <label className="field grow">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Physics" required maxLength={60} />
          </label>
          <label className="field">
            <span>Colour</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Chapters, one per line ({lines.length})</span>
          <textarea rows={8} value={chapters} onChange={(e) => setChapters(e.target.value)} placeholder={'Motion\nForce and Laws of Motion\nGravitation'} />
        </label>
        <p className="muted small">Chapters start as Medium difficulty; change that in “Edit chapters”.</p>
        <ErrorText>{create.error}</ErrorText>
        <button className="btn primary" disabled={create.busy || lines.length > 60}>
          Add subject
        </button>
      </form>
    </section>
  )
}

function CopyClass({ code, cls, boards, onCopied }) {
  const [from, setFrom] = useState('cbse:9')
  const [result, setResult] = useState(null)
  const sources = boards.flatMap((board) => board.classes.filter((row) => row.subjects > 0 && !(board.code === code && row.cls === cls)).map((row) => ({ value: `${board.code}:${row.cls}`, label: `${board.name}, Class ${row.cls} (${row.subjects})` })))
  const selected = sources.some((source) => source.value === from) ? from : (sources[0]?.value ?? '')
  const copy = useAction(async () => {
    const [fromBoard, fromCls] = selected.split(':')
    const copied = await syllabus.copyClass(code, cls, fromBoard, Number(fromCls))
    setResult(copied.added ? `Copied ${copied.added} subject${copied.added === 1 ? '' : 's'}.` : 'Nothing new to copy: this class already has those subjects.')
    onCopied()
  })
  return (
    <section className="section">
      <h2>Copy from another class</h2>
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault()
          copy.run()
        }}
      >
        <p className="muted small">Brings in every subject (with chapters) this class doesn’t have yet. Handy when two boards share books.</p>
        <label className="field">
          <span>Copy from</span>
          <select value={selected} onChange={(e) => setFrom(e.target.value)} disabled={!sources.length}>
            {sources.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <ErrorText>{copy.error}</ErrorText>
        {result ? <p className="success">{result}</p> : null}
        <button className="btn" disabled={copy.busy || !selected}>
          Copy subjects
        </button>
      </form>
    </section>
  )
}

/** " · Ganita Prakash – Part 1 (8), Ganita Prakash – Part 2 (7)" for subjects split into books. */
function bookSummary(chapters) {
  const counts = new Map()
  for (const chapter of chapters) if (chapter.book) counts.set(chapter.book, (counts.get(chapter.book) ?? 0) + 1)
  if (!counts.size) return ''
  return ` · ${[...counts].map(([book, count]) => `${book} (${count})`).join(', ')}`
}
