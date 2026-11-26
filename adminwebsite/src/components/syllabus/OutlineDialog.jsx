import { useMemo, useState } from 'react'
import { Dialog } from '../feedback.jsx'
import { ErrorText } from '../ui.jsx'
import { countTree, parseOutline } from './tree.js'

/**
 * Adds many items at once from an indented outline, one per line. Each indent level goes one
 * step down the exam's hierarchy.
 */
export function OutlineDialog({ kinds, labels, onAdd, onClose }) {
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseOutline(text, kinds), [text, kinds])
  const counts = useMemo(() => {
    if (kinds[0] === 'unit') return countTree(parsed.roots)
    return countTree([{ name: '', chapters: parsed.roots }])
  }, [parsed, kinds])
  const summary = [
    kinds.includes('unit') && counts.units ? `${counts.units} ${labels.unit.toLowerCase()}${counts.units === 1 ? '' : 's'}` : null,
    counts.chapters ? `${counts.chapters} chapter${counts.chapters === 1 ? '' : 's'}` : null,
    counts.topics ? `${counts.topics} topic${counts.topics === 1 ? '' : 's'}` : null,
    counts.subtopics ? `${counts.subtopics} subtopic${counts.subtopics === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  const example = kinds
    .map((kind, depth) => `${'  '.repeat(depth)}${{ unit: 'Mechanics', chapter: 'Kinematics', topic: 'Projectile motion', subtopic: 'Range of a projectile' }[kind]}`)
    .join('\n')
  return (
    <Dialog
      title="Paste an outline"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted small grow">{summary.length ? `Adds ${summary.join(', ')}` : 'Nothing to add yet'}</span>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!parsed.roots.length || parsed.problems.length > 0} onClick={() => onAdd(parsed.roots)}>
            Add to subject
          </button>
        </>
      }
    >
      <p className="muted small">
        One item per line. Indent with two spaces or a tab to go one level down: {kinds.map((kind) => (kind === 'unit' ? labels.unit.toLowerCase() : kind)).join(' → ')}. Leading “-”, “*” or “1.” are ignored.
        {kinds[0] === 'unit' ? ` ${labels.unit}s with a name the subject already has get the new chapters.` : ''}
      </p>
      <textarea className="mono" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={example} autoFocus spellCheck={false} />
      <ErrorText>{parsed.problems.slice(0, 5).join('. ')}</ErrorText>
    </Dialog>
  )
}
