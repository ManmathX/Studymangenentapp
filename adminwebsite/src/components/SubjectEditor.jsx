import { useState } from 'react'
import { DIFFICULTIES, syllabus } from '../api.js'
import { useAction } from '../hooks.js'
import { ErrorText } from './ui.jsx'

const MAX_CHAPTERS = 60
let rowSequence = 0
const withRowId = (chapter) => {
  rowSequence += 1
  return { ...chapter, rowId: rowSequence }
}

/** Edits one subject's name, colour and chapter list (order, names, difficulty). Saves all at once. */
export function SubjectEditor({ subject, onSaved, onClose }) {
  const [name, setName] = useState(subject.name)
  const [color, setColor] = useState(subject.color)
  const [chapters, setChapters] = useState(() => subject.chapters.map(withRowId))
  const [bulk, setBulk] = useState('')
  const [saved, setSaved] = useState(false)

  const change = (next) => {
    setSaved(false)
    setChapters(next)
  }
  const update = (index, patch) => change(chapters.map((chapter, i) => (i === index ? { ...chapter, ...patch } : chapter)))
  const move = (index, delta) => {
    const next = [...chapters]
    const [row] = next.splice(index, 1)
    next.splice(index + delta, 0, row)
    change(next)
  }
  const addLines = () => {
    const lines = bulk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines.length) return
    change([...chapters, ...lines.map((line) => withRowId({ name: line, difficulty: 2 }))])
    setBulk('')
  }

  const save = useAction(async () => {
    const clean = chapters.map((chapter) => ({ name: chapter.name.trim(), difficulty: Number(chapter.difficulty) }))
    if (clean.some((chapter) => !chapter.name)) throw new Error('Every chapter needs a name. Delete empty rows.')
    await syllabus.updateSubject(subject.id, { name: name.trim(), color: color.toUpperCase(), chapters: clean })
    setSaved(true)
    onSaved()
  })

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault()
        save.run()
      }}
    >
      <div className="row">
        <label className="field grow">
          <span>Subject name</span>
          <input
            value={name}
            onChange={(e) => {
              setSaved(false)
              setName(e.target.value)
            }}
            required
            maxLength={60}
          />
        </label>
        <label className="field">
          <span>Colour</span>
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setSaved(false)
              setColor(e.target.value)
            }}
          />
        </label>
      </div>

      <table className="chapters">
        <thead>
          <tr>
            <th>#</th>
            <th>Chapter</th>
            <th>Difficulty</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {chapters.map((chapter, index) => (
            <tr key={chapter.rowId}>
              <td className="muted">{index + 1}</td>
              <td className="grow">
                <input value={chapter.name} onChange={(e) => update(index, { name: e.target.value })} maxLength={120} aria-label={`Chapter ${index + 1} name`} />
              </td>
              <td>
                <select value={chapter.difficulty} onChange={(e) => update(index, { difficulty: Number(e.target.value) })} aria-label={`Chapter ${index + 1} difficulty`}>
                  {DIFFICULTIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="row nowrap">
                <button type="button" className="btn icon" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="btn icon" onClick={() => move(index, 1)} disabled={index === chapters.length - 1} aria-label="Move down">
                  ↓
                </button>
                <button type="button" className="btn icon danger" onClick={() => change(chapters.filter((_, i) => i !== index))} aria-label={`Delete chapter ${index + 1}`}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {!chapters.length ? (
            <tr>
              <td colSpan={4} className="muted">
                No chapters. Add some below; students only see subjects that have chapters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <label className="field">
        <span>Add chapters, one per line</span>
        <textarea rows={3} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Light: Reflection and Refraction\nElectricity'} />
      </label>
      <div className="row">
        <button type="button" className="btn" onClick={addLines} disabled={!bulk.trim()}>
          Add to list
        </button>
        <span className="grow" />
        {chapters.length > MAX_CHAPTERS ? <span className="error">At most {MAX_CHAPTERS} chapters.</span> : null}
        {saved ? <span className="success">Saved.</span> : null}
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
        <button className="btn primary" disabled={save.busy || chapters.length > MAX_CHAPTERS}>
          {save.busy ? 'Saving…' : 'Save subject'}
        </button>
      </div>
      <ErrorText>{save.error}</ErrorText>
    </form>
  )
}
