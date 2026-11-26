import { useState } from 'react'
import { syllabi as syllabiApi } from '../../api.js'
import { plural } from '../../format.js'
import { useAction } from '../../hooks.js'
import { Dialog } from '../feedback.jsx'
import { ErrorText, Field, Icon } from '../ui.jsx'

const MAX_BYTES = 1_800_000
const COLUMNS = 'level, subject, unit, chapter, topic, subtopic, difficulty, weightage, marks, priority, important, grade, book'

/**
 * Imports a CSV sheet or a JSON export into a draft. Always previews first (a dry run on the
 * server), then applies the same file on confirmation.
 */
export function ImportDialog({ syllabusId, exam, onClose, onImported }) {
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState('csv')
  const [mode, setMode] = useState('merge')
  const [preview, setPreview] = useState(null)
  const levelsNote = exam.structure.levels.length ? `Fill “level” with a ${exam.structure.levelLabel.toLowerCase()} key or name (${exam.structure.levels.map((l) => l.key).slice(0, 4).join(', ')}…).` : 'Leave “level” empty: this exam has one syllabus.'

  const change = (next) => {
    setPreview(null)
    setContent(next)
    if (next.trim().startsWith('{')) setFormat('json')
  }
  const pick = async (file) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      run.setError('That file is larger than 1.8 MB. Split it by subject or level.')
      return
    }
    setFileName(file.name)
    setFormat(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv')
    setPreview(null)
    setContent(await file.text())
  }
  const run = useAction(async (dryRun) => {
    const result = await syllabiApi.importFile(syllabusId, { format, content, mode, dryRun })
    if (dryRun) setPreview(result)
    else if (result.applied) onImported(result)
    else setPreview(result)
  })

  const ok = preview && !preview.problems.length
  const nothing = ok && !preview.subjects.added && !preview.subjects.updated && !preview.subjects.removed
  return (
    <Dialog
      title="Import syllabus"
      wide
      busy={run.busy}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={run.busy}>
            Cancel
          </button>
          {ok && !nothing ? (
            <button type="button" className="btn primary" onClick={() => run.run(false)} disabled={run.busy}>
              {run.busy ? 'Importing…' : mode === 'replace' ? 'Replace and import' : 'Import'}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => run.run(true)} disabled={run.busy || !content.trim()}>
              {run.busy ? 'Checking…' : 'Preview'}
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <div className="row">
          <label className="btn">
            <Icon name="upload" /> Choose a file
            <input type="file" accept=".csv,.json,text/csv,application/json" className="visually-hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <span className="muted small">{fileName || 'or paste below'}</span>
          <span className="grow" />
          <div className="segmented" role="radiogroup" aria-label="Format">
            {['csv', 'json'].map((value) => (
              <button key={value} type="button" role="radio" aria-checked={format === value} className={format === value ? 'on' : ''} onClick={() => setFormat(value)}>
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <textarea className="mono" rows={9} value={content} onChange={(e) => change(e.target.value)} placeholder={format === 'csv' ? `${COLUMNS}\n,Physics,Mechanics,Kinematics,,,2,8,,high,yes,,11,` : '{ "subjects": [ … ] }  (a JSON export from this portal)'} spellCheck={false} />
        {format === 'csv' ? (
          <p className="muted small">
            Columns: <code>{COLUMNS}</code>. Only “subject” is required. Each row is the deepest name it fills in; its other columns set that item’s details. {levelsNote}
          </p>
        ) : null}
        <Field label="How to import">
          <div className="segmented" role="radiogroup" aria-label="Import mode">
            <button type="button" role="radio" aria-checked={mode === 'merge'} className={mode === 'merge' ? 'on' : ''} onClick={() => {
                setMode('merge')
                setPreview(null)
              }}>
              Merge: add and update by name
            </button>
            <button type="button" role="radio" aria-checked={mode === 'replace'} className={mode === 'replace' ? 'on' : ''} onClick={() => {
                setMode('replace')
                setPreview(null)
              }}>
              Replace the levels in the file
            </button>
          </div>
        </Field>
        <ErrorText>{run.error}</ErrorText>
        {preview ? <ImportPreview result={preview} mode={mode} /> : null}
      </div>
    </Dialog>
  )
}

function ImportPreview({ result, mode }) {
  if (result.problems.length)
    return (
      <div className="callout tone-danger" role="alert">
        <strong>Fix {plural(result.problems.length, 'problem')} first</strong>
        <ul className="compact-list">
          {result.problems.slice(0, 20).map((problem, i) => (
            <li key={i}>
              {problem.row ? `Row ${problem.row}: ` : problem.path ? `${problem.path}: ` : ''}
              {problem.message}
            </li>
          ))}
        </ul>
        {result.problems.length > 20 ? <p className="small">…and {result.problems.length - 20} more.</p> : null}
      </div>
    )
  const { subjects, added, updated } = result
  const line = (counts) =>
    [counts.units && plural(counts.units, 'unit'), counts.chapters && plural(counts.chapters, 'chapter'), counts.topics && plural(counts.topics, 'topic'), counts.subtopics && plural(counts.subtopics, 'subtopic')].filter(Boolean).join(', ') || 'nothing'
  return (
    <div className={`callout ${result.applied ? 'tone-success' : 'tone-info'}`}>
      <strong>{result.applied ? 'Imported' : 'Preview: nothing has changed yet'}</strong>
      <ul className="compact-list">
        <li>
          Subjects: {subjects.added} new, {subjects.updated} updated{mode === 'replace' ? `, ${subjects.removed} replaced` : ''}
        </li>
        <li>Adds {line(added)}</li>
        {mode === 'merge' ? <li>Updates {line(updated)}</li> : null}
      </ul>
      {mode === 'replace' && subjects.removed ? <p className="small">Every subject at the levels in the file is replaced by the file’s subjects.</p> : null}
    </div>
  )
}
