import { useState } from 'react'
import { exams as examsApi, syllabi as syllabiApi } from '../../api.js'
import { versionLabel } from '../../format.js'
import { useAction, useLoad } from '../../hooks.js'
import { Dialog } from '../feedback.jsx'
import { ErrorText, Field } from '../ui.jsx'

/** Copies the subjects of a level of any version of any exam into the open level of this draft. */
export function CopyLevelDialog({ syllabusId, exam, level, levelName, onClose, onCopied }) {
  const [fromExam, setFromExam] = useState(exam.code)
  const [fromVersion, setFromVersion] = useState('')
  const [fromLevel, setFromLevel] = useState('')
  const examList = useLoad(() => examsApi.list({ limit: 100 }).then((page) => page.items), [])
  const versions = useLoad(() => examsApi.versions(fromExam), [fromExam])
  const source = (examList.data ?? []).find((item) => item.code === fromExam)
  const levels = source?.structure.levels ?? []
  const choices = (versions.data ?? []).filter((version) => version.id !== syllabusId || levels.length > 1)
  const copy = useAction(async () => {
    if (!fromVersion) throw new Error('Pick a version to copy from.')
    if (levels.length && !fromLevel) throw new Error(`Pick a ${source.structure.levelLabel.toLowerCase()}.`)
    onCopied(await syllabiApi.copyLevel(syllabusId, level, fromVersion, fromLevel))
  })
  return (
    <Dialog
      title={`Copy subjects into ${levelName || exam.name}`}
      onClose={onClose}
      busy={copy.busy}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={copy.run} disabled={copy.busy}>
            {copy.busy ? 'Copying…' : 'Copy subjects'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">Brings in every subject (with its whole syllabus) that this level doesn’t have yet. Handy when two boards share books, or JEE Main and JEE Advanced share chapters.</p>
        <Field label="From exam">
          <select
            value={fromExam}
            onChange={(e) => {
              setFromExam(e.target.value)
              setFromVersion('')
              setFromLevel('')
            }}
          >
            {(examList.data ?? [exam]).map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Version">
          <select value={fromVersion} onChange={(e) => setFromVersion(e.target.value)}>
            <option value="">Pick one</option>
            {choices.map((version) => (
              <option key={version.id} value={version.id}>
                {versionLabel(version)} · {version.status}
                {version.id === syllabusId ? ' (this draft)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {levels.length ? (
          <Field label={source.structure.levelLabel}>
            <select value={fromLevel} onChange={(e) => setFromLevel(e.target.value)}>
              <option value="">Pick one</option>
              {levels
                .filter((item) => !(fromVersion === syllabusId && item.key === level))
                .map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        <ErrorText>{copy.error || versions.error}</ErrorText>
      </div>
    </Dialog>
  )
}
