import { DIFFICULTIES, PRIORITIES } from '../../api.js'
import { Dialog } from '../feedback.jsx'
import { Field, Icon, Toggle } from '../ui.jsx'

const number = (value) => (value === '' ? undefined : Number(value))

/**
 * Everything about one unit, chapter, topic or subtopic that doesn't fit on its row. Changes
 * apply to the working copy straight away; Save on the page stores them.
 */
export function NodeDetails({ kind, node, exam, editable, units, unitIndex, onChange, onClose, onMove, onMoveToUnit, onDuplicate, onDelete }) {
  const levelsAreClasses = exam.structure.levels.some((level) => level.grade)
  const unitLabel = exam.structure.unitLabel
  const set = (patch) => editable && onChange(patch)
  return (
    <Dialog
      title={`${kind === 'unit' ? unitLabel : kind[0].toUpperCase() + kind.slice(1)}: ${node.name || 'no name yet'}`}
      onClose={onClose}
      footer={
        <>
          {editable ? (
            <div className="row grow">
              <button type="button" className="btn icon" onClick={() => onMove(-1)} aria-label="Move up" title="Move up">
                <Icon name="up" />
              </button>
              <button type="button" className="btn icon" onClick={() => onMove(1)} aria-label="Move down" title="Move down">
                <Icon name="down" />
              </button>
              {kind !== 'subtopic' ? (
                <button type="button" className="btn" onClick={onDuplicate}>
                  <Icon name="copy" /> Duplicate
                </button>
              ) : null}
              <button type="button" className="btn danger" onClick={onDelete}>
                <Icon name="trash" /> Delete
              </button>
            </div>
          ) : null}
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <fieldset className="stack" disabled={!editable}>
        <Field label="Name">
          <input value={node.name} onChange={(e) => set({ name: e.target.value })} maxLength={kind === 'unit' || kind === 'chapter' ? 120 : 160} autoFocus />
        </Field>
        {kind !== 'unit' ? <Toggle checked={node.important} onChange={(important) => set({ important })} label="Important" hint="Marked with a star for students" /> : null}
        {kind === 'chapter' ? (
          <Field label="Difficulty" hint="The planner gives harder chapters more time">
            <div className="segmented" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map((option) => (
                <button key={option.value} type="button" role="radio" aria-checked={node.difficulty === option.value} className={node.difficulty === option.value ? 'on' : ''} onClick={() => set({ difficulty: option.value })}>
                  {option.label}
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        {kind !== 'subtopic' ? (
          <div className="form-grid-3">
            <Field label="Weightage (%)">
              <input type="number" min={0} max={100} step="any" value={node.weightage ?? ''} onChange={(e) => set({ weightage: number(e.target.value) })} placeholder="—" />
            </Field>
            <Field label="Marks">
              <input type="number" min={0} max={1000} step="any" value={node.marks ?? ''} onChange={(e) => set({ marks: number(e.target.value) })} placeholder="—" />
            </Field>
            {kind !== 'unit' ? (
              <Field label="Priority">
                <select value={node.priority ?? ''} onChange={(e) => set({ priority: e.target.value || undefined })}>
                  <option value="">—</option>
                  {PRIORITIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        ) : null}
        {kind === 'chapter' ? (
          <div className="form-grid-2">
            {!levelsAreClasses ? (
              <Field label="Taught in class" hint="E.g. 11 or 12 for JEE and NEET">
                <select value={node.grade ?? ''} onChange={(e) => set({ grade: number(e.target.value) })}>
                  <option value="">—</option>
                  {[6, 7, 8, 9, 10, 11, 12].map((grade) => (
                    <option key={grade} value={grade}>
                      Class {grade}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Book" hint="The textbook, e.g. “Physics – Part 1”">
              <input value={node.book ?? ''} onChange={(e) => set({ book: e.target.value || undefined })} maxLength={60} />
            </Field>
          </div>
        ) : null}
        {kind === 'chapter' && exam.structure.useUnits && units.length > 1 ? (
          <Field label={`Move to another ${unitLabel.toLowerCase()}`}>
            <select value={unitIndex} onChange={(e) => onMoveToUnit(Number(e.target.value))}>
              {units.map((unit, index) => (
                <option key={unit.uid} value={index}>
                  {unit.name || `Not in a ${unitLabel.toLowerCase()}`}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </fieldset>
    </Dialog>
  )
}
