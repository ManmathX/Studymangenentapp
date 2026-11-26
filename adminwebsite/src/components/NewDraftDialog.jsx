import { useState } from 'react'
import { exams as examsApi, syllabi as syllabiApi } from '../api.js'
import { currentAcademicYear, versionLabel } from '../format.js'
import { useAction, useLoad } from '../hooks.js'
import { Dialog } from './feedback.jsx'
import { ErrorText, Field } from './ui.jsx'

/**
 * Starts a draft syllabus. With `source` it copies that version (into this exam or another one);
 * without, it starts empty or copies any version of any exam.
 */
export function NewDraftDialog({ exam, source = null, onClose, onCreated }) {
  const [target, setTarget] = useState(exam.code)
  const [year, setYear] = useState(source?.academicYear ?? currentAcademicYear())
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState(source ? 'copy' : 'empty')
  const [fromExam, setFromExam] = useState(source?.exam ?? exam.code)
  const [fromVersion, setFromVersion] = useState(source?.id ?? '')
  const [fromLevel, setFromLevel] = useState('')
  const [toLevel, setToLevel] = useState('')
  const allExams = useLoad(() => examsApi.list({ limit: 100 }).then((page) => page.items), [])
  const versions = useLoad(() => (mode === 'copy' && !source ? examsApi.versions(fromExam) : Promise.resolve([])), [mode, fromExam, Boolean(source)])
  const list = allExams.data ?? []
  const targetExam = list.find((item) => item.code === target) ?? exam
  const sourceExam = list.find((item) => item.code === fromExam)
  const sourceLevels = sourceExam?.structure.levels ?? []
  const targetLevels = targetExam.structure.levels
  const versionId = source?.id ?? fromVersion ?? ''
  const needsLevel = mode === 'copy' && sourceLevels.length > 0 && targetLevels.length === 0
  const sameShape = JSON.stringify(sourceLevels.map((l) => l.key)) === JSON.stringify(targetLevels.map((l) => l.key))

  const create = useAction(async () => {
    if (!/^20\d{2}(-\d{2})?$/.test(year)) throw new Error('Use an academic year like 2026-27 or 2027.')
    if (mode === 'copy' && !versionId) throw new Error('Pick the version to copy.')
    if (needsLevel && !fromLevel) throw new Error(`${targetExam.name} has one syllabus for everyone. Pick which ${sourceExam?.structure.levelLabel.toLowerCase() ?? 'level'} to copy.`)
    const copyFrom = mode === 'copy' ? { syllabusId: versionId, ...(fromLevel ? { level: fromLevel } : {}), ...(fromLevel && toLevel ? { toLevel } : {}) } : undefined
    const result =
      source && target === source.exam && !fromLevel
        ? await syllabiApi.duplicate(source.id, { academicYear: year, ...(title ? { title } : {}) })
        : await examsApi.createDraft(target, { academicYear: year, ...(title ? { title } : {}), ...(copyFrom ? { copyFrom } : {}) })
    onCreated(result)
  })

  return (
    <Dialog
      title={source ? `Copy ${versionLabel(source)}` : 'New draft syllabus'}
      onClose={onClose}
      busy={create.busy}
      wide
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={create.busy}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={create.run} disabled={create.busy}>
            {create.busy ? 'Creating…' : 'Create draft'}
          </button>
        </>
      }
    >
      <div className="stack">
        {source ? (
          <Field label="Copy into" hint="Copy a syllabus to another exam to start from it, e.g. JEE Main into JEE Advanced.">
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {(list.length ? list : [exam]).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                  {item.code === exam.code ? ' (this exam)' : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="segmented" role="radiogroup" aria-label="Start from">
            <button type="button" role="radio" aria-checked={mode === 'empty'} className={mode === 'empty' ? 'on' : ''} onClick={() => setMode('empty')}>
              Empty
            </button>
            <button type="button" role="radio" aria-checked={mode === 'copy'} className={mode === 'copy' ? 'on' : ''} onClick={() => setMode('copy')}>
              Copy an existing syllabus
            </button>
          </div>
        )}
        {mode === 'copy' && !source ? (
          <div className="form-grid-2">
            <Field label="From exam">
              <select
                value={fromExam}
                onChange={(e) => {
                  setFromExam(e.target.value)
                  setFromVersion('')
                  setFromLevel('')
                }}
              >
                {list.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Version">
              <select value={fromVersion} onChange={(e) => setFromVersion(e.target.value)}>
                <option value="">Pick one</option>
                {(versions.data ?? []).map((version) => (
                  <option key={version.id} value={version.id}>
                    {versionLabel(version)} · {version.status} · {version.counts.chapters} chapters
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}
        {mode === 'copy' && sourceLevels.length && (!sameShape || needsLevel || fromLevel) ? (
          <div className="form-grid-2">
            <Field label={`Copy which ${sourceExam?.structure.levelLabel.toLowerCase() ?? 'level'}`}>
              <select value={fromLevel} onChange={(e) => setFromLevel(e.target.value)}>
                {needsLevel ? <option value="">Pick one</option> : <option value="">Every level that {targetExam.name} also has</option>}
                {sourceLevels.map((level) => (
                  <option key={level.key} value={level.key}>
                    {level.name}
                  </option>
                ))}
              </select>
            </Field>
            {fromLevel && targetLevels.length ? (
              <Field label={`Into which ${targetExam.structure.levelLabel.toLowerCase()}`}>
                <select value={toLevel} onChange={(e) => setToLevel(e.target.value)}>
                  <option value="">The same one</option>
                  {targetLevels.map((level) => (
                    <option key={level.key} value={level.key}>
                      {level.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        ) : null}
        <div className="form-grid-2">
          <Field label="Academic year" hint="2026-27 for a school year, or 2027 for an exam held once a year">
            <input value={year} onChange={(e) => setYear(e.target.value.trim())} />
          </Field>
          <Field label="Title (optional)">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="2027 syllabus update" />
          </Field>
        </div>
        <p className="muted small">Drafts are only seen here. Students get a syllabus once you publish it.</p>
        <ErrorText>{create.error || allExams.error || versions.error}</ErrorText>
      </div>
    </Dialog>
  )
}
