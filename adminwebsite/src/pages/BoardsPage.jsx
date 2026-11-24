import { useState } from 'react'
import { Link } from 'react-router-dom'
import { syllabus } from '../api.js'
import { ConfirmButton, ErrorText } from '../components/ui.jsx'
import { useAction, useLoad } from '../hooks.js'

const KIND_LABEL = { national: 'National boards', state: 'State boards' }

export function BoardsPage() {
  const boards = useLoad(syllabus.overview, [])
  const [loadedMessage, setLoadedMessage] = useState('')
  const loadStandard = useAction(async () => {
    const { added, updated } = await syllabus.loadStandard()
    const plural = (n) => `${n} subject${n === 1 ? '' : 's'}`
    const parts = [added ? `added ${plural(added)}` : '', updated ? `filled in books and chapters for ${plural(updated)}` : ''].filter(Boolean)
    setLoadedMessage(parts.length ? `Done: ${parts.join(' and ')}.` : 'CBSE and ICSE already have every standard subject, book and chapter.')
    boards.reload()
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Boards</h1>
          <p className="muted">Pick a class to edit its subjects and chapters. Students see a class once it has at least one subject with chapters.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={loadStandard.run} disabled={loadStandard.busy} title="Adds the standard CBSE and ICSE/ISC subjects, books and chapters for classes 6–12. Your renamed subjects, difficulties and own chapters are kept.">
            {loadStandard.busy ? 'Loading…' : 'Load standard syllabus'}
          </button>
        </div>
      </div>
      {loadedMessage ? <p className="muted small">{loadedMessage}</p> : null}
      <ErrorText>{loadStandard.error}</ErrorText>
      {boards.loading && !boards.data ? <p className="muted">Loading…</p> : null}
      <ErrorText>{boards.error}</ErrorText>
      {boards.data
        ? ['national', 'state'].map((kind) => {
            const list = boards.data.filter((board) => board.kind === kind)
            return (
              <section key={kind} className="section">
                <h2>{KIND_LABEL[kind]}</h2>
                {list.length ? (
                  list.map((board) => <BoardCard key={board.code} board={board} onChanged={boards.reload} />)
                ) : (
                  <p className="muted">{kind === 'state' ? 'No state boards yet. Add one below, e.g. “Odisha Board (BSE)”.' : 'No national boards.'}</p>
                )}
              </section>
            )
          })
        : null}
      <NewBoard onCreated={boards.reload} />
    </>
  )
}

function BoardCard({ board, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(board.name)
  const [kind, setKind] = useState(board.kind)
  const save = useAction(async () => {
    await syllabus.updateBoard(board.code, { name: name.trim(), kind })
    setEditing(false)
    onChanged()
  })
  const remove = useAction(async () => {
    await syllabus.deleteBoard(board.code)
    onChanged()
  })
  const loaded = board.classes.filter((row) => row.subjects > 0).length

  return (
    <article className="card board">
      <div className="board-head">
        {editing ? (
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              save.run()
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Board name" required maxLength={60} />
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Board kind">
              <option value="national">National</option>
              <option value="state">State</option>
            </select>
            <button className="btn primary" disabled={save.busy}>
              Save
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div>
              <h3>{board.name}</h3>
              <p className="muted small">
                Code <code>{board.code}</code> · {loaded ? `${loaded} class${loaded === 1 ? '' : 'es'} loaded` : 'no classes loaded yet'}
              </p>
            </div>
            <div className="row">
              <button className="btn" onClick={() => setEditing(true)}>
                Rename
              </button>
              <ConfirmButton onConfirm={remove.run} disabled={remove.busy} confirmLabel="Delete board and all its subjects?">
                Delete
              </ConfirmButton>
            </div>
          </>
        )}
      </div>
      <ErrorText>{save.error || remove.error}</ErrorText>
      <div className="class-grid">
        {board.classes.map((row) => (
          <Link key={row.cls} to={`/boards/${board.code}/class/${row.cls}`} className={`class-cell${row.subjects ? ' loaded' : ''}`}>
            <span className="class-number">{row.cls}</span>
            <span className="small">{row.subjects ? `${row.subjects} subject${row.subjects === 1 ? '' : 's'}` : 'Empty'}</span>
          </Link>
        ))}
      </div>
    </article>
  )
}

function NewBoard({ onCreated }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('state')
  const [code, setCode] = useState('')
  const create = useAction(async () => {
    await syllabus.createBoard({ name: name.trim(), kind, ...(code.trim() ? { code: code.trim().toLowerCase() } : {}) })
    setName('')
    setCode('')
    onCreated()
  })
  return (
    <section className="section">
      <h2>Add a board</h2>
      <form
        className="card form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          create.run()
        }}
      >
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Odisha Board (BSE)" required maxLength={60} />
        </label>
        <label className="field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="state">State board</option>
            <option value="national">National board</option>
          </select>
        </label>
        <label className="field">
          <span>Code (optional)</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="odisha" pattern="[a-z][a-z0-9-]{1,31}" title="Lowercase letters, numbers and dashes" />
        </label>
        <div className="form-actions">
          <button className="btn primary" disabled={create.busy}>
            Add board
          </button>
          <ErrorText>{create.error}</ErrorText>
        </div>
      </form>
    </section>
  )
}
