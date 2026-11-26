import { useEffect, useMemo, useState } from 'react'
import { DIFFICULTIES, subjects as subjectsApi } from '../../api.js'
import { plural } from '../../format.js'
import { useConfirm, useToast } from '../feedback.jsx'
import { SortableList } from '../Sortable.jsx'
import { Badge, ErrorText, Icon } from '../ui.jsx'
import { NodeDetails } from './NodeDetails.jsx'
import { OutlineDialog } from './OutlineDialog.jsx'
import { adoptUids, changeList, countTree, descendants, duplicateNode, insertNode, KINDS, listAt, moveNode, NEW, newUnit, nodeAt, removeNode, toSaveable, treeProblems, updateNode, withUids } from './tree.js'

const PRIORITY_LABEL = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' }

/** Without units, chapters live in one unnamed unit; make sure there is one to add to. */
const withBase = (units, useUnits) => (!useUnits && !units.length ? [newUnit('')] : units)

function initialState(subject, useUnits, previous) {
  const units = previous ? adoptUids(subject.units, previous) : withUids(subject.units)
  return { name: subject.name, color: subject.color, units: withBase(units, useUnits) }
}

const snapshot = (state) => JSON.stringify({ name: state.name.trim(), color: state.color.toUpperCase(), units: toSaveable(state.units) })

/**
 * Edits one subject of a draft: its name, colour, and its tree of units, chapters, topics
 * and subtopics. Everything is kept locally until "Save draft" (or Ctrl/⌘+S), which sends the
 * whole subject with the revision it started from.
 */
export function SubjectEditor({ subject, exam, editable, onSaved, onDirty, onDelete }) {
  const confirm = useConfirm()
  const toast = useToast()
  const structure = exam.structure
  const [state, setState] = useState(() => initialState(subject, structure.useUnits))
  const [saved, setSaved] = useState(() => snapshot(initialState(subject, structure.useUnits)))
  const [revision, setRevision] = useState(subject.revision)
  const [expanded, setExpanded] = useState(() => new Set())
  const [collapsedUnits, setCollapsedUnits] = useState(() => new Set())
  const [focusUid, setFocusUid] = useState(null)
  const [details, setDetails] = useState(null)
  const [outline, setOutline] = useState(false)
  const [error, setError] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  const { units } = state
  const dirty = snapshot(state) !== saved
  const showUnits = structure.useUnits || units.some((unit) => unit.name)
  const showTopics = structure.useTopics || units.some((unit) => unit.chapters.some((chapter) => chapter.topics.length))
  const showSubtopics = showTopics && (structure.useSubtopics || units.some((unit) => unit.chapters.some((chapter) => chapter.topics.some((topic) => topic.subtopics.length))))
  const counts = countTree(units)
  const numbers = useMemo(() => {
    const map = new Map()
    let n = 0
    for (const unit of units) for (const chapter of unit.chapters) map.set(chapter.uid, (n += 1))
    return map
  }, [units])

  useEffect(() => onDirty?.(dirty), [dirty, onDirty])

  const setUnits = (change) => setState((current) => ({ ...current, units: change(current.units) }))
  const expand = (uid) => setExpanded((set) => new Set(set).add(uid))

  const save = async () => {
    setTried(true)
    const problems = treeProblems(state.name, units)
    if (problems.length) {
      setError(problems.join(' '))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await subjectsApi.save(subject.id, {
        revision,
        name: state.name.trim(),
        color: state.color.toUpperCase(),
        units: toSaveable(units),
      })
      // The server's copy replaces ours (it trims and tidies), keeping row ids so open rows stay open.
      const next = initialState(result, structure.useUnits, units)
      setState(next)
      setSaved(snapshot(next))
      setRevision(result.revision)
      setTried(false)
      onSaved(result)
      toast(`${result.name} saved.`)
    } catch (caught) {
      setConflict(caught.code === 'SUBJECT_CHANGED')
      setError(caught.message)
    } finally {
      setSaving(false)
    }
  }

  // Ctrl/⌘+S saves.
  useEffect(() => {
    if (!editable) return undefined
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (dirty && !saving) save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const reload = async () => {
    const fresh = await subjectsApi.get(subject.id)
    const next = initialState(fresh, structure.useUnits)
    setState(next)
    setSaved(snapshot(next))
    setRevision(fresh.revision)
    setConflict(false)
    setError(null)
  }

  const discard = async () => {
    if (!(await confirm({ title: 'Discard your changes?', message: `Everything you changed in ${subject.name} since the last save is undone.`, confirmLabel: 'Discard' }))) return
    const last = JSON.parse(saved)
    setState({ name: last.name, color: last.color, units: withBase(adoptUids(last.units, units), structure.useUnits) })
    setError(null)
    setTried(false)
  }

  /* ---------- Tree operations ---------- */

  const kindAt = (path) => KINDS[path.length - 1]
  const ops = {
    editable,
    focusUid,
    tried,
    update: (path, patch) => setUnits((list) => updateNode(list, path, patch)),
    add: (parentPath, at) => {
      const node = NEW[parentPath.length]()
      setUnits((list) => insertNode(list, parentPath, node, at))
      setFocusUid(node.uid)
      if (parentPath.length >= 2) expand(nodeAt(units, parentPath).uid)
    },
    addAfter: (path) => ops.add(path.slice(0, -1), path[path.length - 1] + 1),
    reorder: (parentPath, list) => setUnits((all) => changeList(all, parentPath, () => list)),
    remove: async (path) => {
      const node = nodeAt(units, path)
      const kind = kindAt(path)
      const below = descendants(node)
      const parts = [below.chapters && plural(below.chapters, 'chapter'), below.topics && plural(below.topics, 'topic'), below.subtopics && plural(below.subtopics, 'subtopic')].filter(Boolean)
      if (parts.length) {
        const ok = await confirm({
          title: `Delete ${node.name || `this ${kind}`}?`,
          message: `It has ${parts.join(', ')}, which are deleted with it. Nothing is saved until you press Save draft.`,
          confirmLabel: `Delete ${kind}`,
        })
        if (!ok) return
      }
      setDetails(null)
      setUnits((list) => removeNode(list, path))
    },
    details: (path) => setDetails(path),
    toggle: (uid) =>
      setExpanded((set) => {
        const next = new Set(set)
        if (next.has(uid)) next.delete(uid)
        else next.add(uid)
        return next
      }),
    isOpen: (uid) => expanded.has(uid),
  }

  const allOpen = () => {
    const uids = units.flatMap((unit) => unit.chapters.flatMap((chapter) => [chapter.uid, ...chapter.topics.map((topic) => topic.uid)]))
    setExpanded(new Set(uids))
    setCollapsedUnits(new Set())
  }

  const addOutline = (roots) => {
    setUnits((list) => {
      if (showUnits) {
        let next = list
        for (const unit of roots) {
          const index = next.findIndex((have) => have.name.trim().toLowerCase() === unit.name.trim().toLowerCase())
          next = index === -1 ? [...next, unit] : changeList(next, [index], (chapters) => [...chapters, ...unit.chapters])
        }
        return next
      }
      const index = Math.max(0, list.findIndex((unit) => !unit.name))
      const base = list.length ? list : [newUnit('')]
      return changeList(base, [index], (chapters) => [...chapters, ...roots])
    })
    setOutline(false)
    toast('Added. Review them, then save the draft.')
  }

  const outlineKinds = [...(showUnits ? ['unit'] : []), 'chapter', ...(showTopics ? ['topic'] : []), ...(showSubtopics ? ['subtopic'] : [])]
  const detailNode = details ? nodeAt(units, details) : null
  const unitLabel = structure.unitLabel
  const flags = { showTopics, showSubtopics }

  return (
    <div className="subject-editor">
      <div className="subject-head">
        <input type="color" value={state.color} disabled={!editable} onChange={(e) => setState((s) => ({ ...s, color: e.target.value }))} aria-label="Subject colour" />
        <input className="subject-name" value={state.name} readOnly={!editable} onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))} maxLength={60} aria-label="Subject name" aria-invalid={tried && !state.name.trim()} />
        {editable ? (
          <button type="button" className="btn icon ghost danger" onClick={onDelete} aria-label={`Delete ${subject.name}`} title="Delete subject">
            <Icon name="trash" />
          </button>
        ) : null}
      </div>
      <div className="tree-toolbar">
        <span className="muted small">
          {[showUnits && counts.units ? plural(counts.units, unitLabel.toLowerCase()) : null, plural(counts.chapters, 'chapter'), showTopics ? plural(counts.topics, 'topic') : null, showSubtopics ? plural(counts.subtopics, 'subtopic') : null].filter(Boolean).join(' · ')}
          {' · '}
          <code>{subject.subjectId}</code>
        </span>
        <span className="grow" />
        {showTopics ? (
          <>
            <button type="button" className="btn ghost small-btn" onClick={allOpen}>
              Expand all
            </button>
            <button
              type="button"
              className="btn ghost small-btn"
              onClick={() => {
                setExpanded(new Set())
              }}
            >
              Collapse all
            </button>
          </>
        ) : null}
        {editable ? (
          <button type="button" className="btn small-btn" onClick={() => setOutline(true)}>
            <Icon name="list" /> Paste outline
          </button>
        ) : null}
      </div>

      <div className="tree" role="tree" aria-label={`${state.name} syllabus`}>
        {showUnits ? (
          <SortableList
            items={units}
            getId={(unit) => unit.uid}
            disabled={!editable}
            onReorder={(list) => ops.reorder([], list)}
            renderItem={(unit, handle) => {
              const u = units.indexOf(unit)
              const collapsed = collapsedUnits.has(unit.uid)
              return (
                <div className="unit-block">
                  <NodeRow
                    kind="unit"
                    node={unit}
                    path={[u]}
                    ops={ops}
                   
                    handle={handle}
                    label={unitLabel}
                    open={!collapsed}
                    onToggle={() =>
                      setCollapsedUnits((set) => {
                        const next = new Set(set)
                        if (next.has(unit.uid)) next.delete(unit.uid)
                        else next.add(unit.uid)
                        return next
                      })
                    }
                    childCount={unit.chapters.length}
                  />
                  {!collapsed ? <ChapterList unit={unit} u={u} ops={ops} numbers={numbers} flags={flags} /> : null}
                </div>
              )
            }}
          />
        ) : (
          units.map((unit, u) => <ChapterList key={unit.uid} unit={unit} u={u} ops={ops} numbers={numbers} flags={flags} />)
        )}
        {showUnits && editable ? (
          <button type="button" className="add-row" onClick={() => ops.add([])}>
            <Icon name="plus" /> Add {unitLabel.toLowerCase()}
          </button>
        ) : null}
        {!counts.chapters && !editable ? <p className="muted small">No chapters.</p> : null}
      </div>

      {editable ? (
        <div className={`save-bar${dirty ? ' dirty' : ''}`}>
          <span className="small">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <ErrorText>{error}</ErrorText>
          {conflict ? (
            <button type="button" className="btn" onClick={reload}>
              Reload subject
            </button>
          ) : null}
          <span className="grow" />
          {dirty ? (
            <button type="button" className="btn ghost" onClick={discard} disabled={saving}>
              Discard
            </button>
          ) : null}
          <button type="button" className="btn primary" onClick={save} disabled={!dirty || saving} title="Ctrl/⌘ + S">
            {saving ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      ) : null}

      {detailNode ? (
        <NodeDetails
          kind={kindAt(details)}
          node={detailNode}
          exam={exam}
          editable={editable}
          units={units}
          unitIndex={details[0]}
          onChange={(patch) => ops.update(details, patch)}
          onClose={() => setDetails(null)}
          onMove={(delta) => {
            const index = details[details.length - 1] + delta
            if (index < 0 || index >= listAt(units, details.slice(0, -1)).length) return
            setUnits((list) => moveNode(list, details, delta))
            setDetails([...details.slice(0, -1), index])
          }}
          onMoveToUnit={(target) => {
            if (target === details[0]) return
            const chapter = nodeAt(units, details)
            setUnits((list) => insertNode(removeNode(list, details), [target], chapter))
            setDetails([target, units[target].chapters.length])
          }}
          onDuplicate={() => {
            const copy = duplicateNode(detailNode)
            const index = details[details.length - 1] + 1
            setUnits((list) => insertNode(list, details.slice(0, -1), copy, index))
            setDetails([...details.slice(0, -1), index])
          }}
          onDelete={() => ops.remove(details)}
        />
      ) : null}
      {outline ? <OutlineDialog kinds={outlineKinds} labels={{ unit: unitLabel }} onAdd={addOutline} onClose={() => setOutline(false)} /> : null}
    </div>
  )
}

function ChapterList({ unit, u, ops, numbers, flags }) {
  return (
    <div className="node-children" role="group">
      <SortableList
        items={unit.chapters}
        getId={(chapter) => chapter.uid}
        disabled={!ops.editable}
        onReorder={(list) => ops.reorder([u], list)}
        renderItem={(chapter, handle) => {
          const c = unit.chapters.indexOf(chapter)
          const open = ops.isOpen(chapter.uid)
          return (
            <>
              <NodeRow kind="chapter" node={chapter} path={[u, c]} ops={ops} handle={handle} number={numbers.get(chapter.uid)} open={open} canOpen={flags.showTopics} onToggle={() => ops.toggle(chapter.uid)} childCount={chapter.topics.length} />
              {open && flags.showTopics ? <TopicList chapter={chapter} path={[u, c]} ops={ops} flags={flags} /> : null}
            </>
          )
        }}
      />
      {ops.editable ? (
        <button type="button" className="add-row" onClick={() => ops.add([u])}>
          <Icon name="plus" /> Add chapter
        </button>
      ) : null}
    </div>
  )
}

function TopicList({ chapter, path, ops, flags }) {
  return (
    <div className="node-children" role="group">
      <SortableList
        items={chapter.topics}
        getId={(topic) => topic.uid}
        disabled={!ops.editable}
        onReorder={(list) => ops.reorder(path, list)}
        renderItem={(topic, handle) => {
          const t = chapter.topics.indexOf(topic)
          const open = ops.isOpen(topic.uid)
          return (
            <>
              <NodeRow kind="topic" node={topic} path={[...path, t]} ops={ops} handle={handle} open={open} canOpen={flags.showSubtopics} onToggle={() => ops.toggle(topic.uid)} childCount={topic.subtopics.length} />
              {open && flags.showSubtopics ? (
                <div className="node-children" role="group">
                  <SortableList
                    items={topic.subtopics}
                    getId={(sub) => sub.uid}
                    disabled={!ops.editable}
                    onReorder={(list) => ops.reorder([...path, t], list)}
                    renderItem={(sub, subHandle) => <NodeRow kind="subtopic" node={sub} path={[...path, t, topic.subtopics.indexOf(sub)]} ops={ops} handle={subHandle} />}
                  />
                  {ops.editable ? (
                    <button type="button" className="add-row" onClick={() => ops.add([...path, t])}>
                      <Icon name="plus" /> Add subtopic
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )
        }}
      />
      {ops.editable ? (
        <button type="button" className="add-row" onClick={() => ops.add(path)}>
          <Icon name="plus" /> Add topic
        </button>
      ) : null}
    </div>
  )
}

function NodeRow({ kind, node, path, ops, handle, number, label, open, canOpen = true, onToggle, childCount = 0 }) {
  const childName = { unit: 'chapter', chapter: 'topic', topic: 'subtopic' }[kind]
  const badges = [
    node.weightage !== undefined ? `${node.weightage}%` : null,
    node.marks !== undefined ? `${node.marks} marks` : null,
    node.priority ? PRIORITY_LABEL[node.priority] : null,
    node.grade ? `Class ${node.grade}` : null,
    node.book ? node.book : null,
  ].filter(Boolean)
  const placeholder = kind === 'unit' ? `${label} name` : `${kind[0].toUpperCase()}${kind.slice(1)} name`
  return (
    <div className={`node-row kind-${kind}`} role="treeitem" aria-level={path.length} aria-expanded={childName && canOpen ? open : undefined}>
      {handle ?? <span className="drag-space" />}
      {childName && canOpen ? (
        <button type="button" className={`caret${open ? ' open' : ''}`} onClick={onToggle} aria-label={open ? `Hide ${childName}s` : `Show ${childName}s`}>
          <Icon name="chevron" size={14} />
        </button>
      ) : (
        <span className="caret-space" />
      )}
      {number ? <span className="node-num">{number}</span> : null}
      <input
        className="node-name"
        value={node.name}
        readOnly={!ops.editable}
        placeholder={kind === 'unit' && !node.name && path.length === 1 ? `Not in a ${label.toLowerCase()}` : placeholder}
        aria-label={placeholder}
        aria-invalid={ops.tried && kind !== 'unit' && !node.name.trim()}
        autoFocus={ops.focusUid === node.uid}
        maxLength={kind === 'unit' || kind === 'chapter' ? 120 : 160}
        onChange={(e) => ops.update(path, { name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && ops.editable) {
            e.preventDefault()
            ops.addAfter(path)
          }
        }}
      />
      {childName && childCount && !open ? <span className="muted small nowrap">{plural(childCount, childName)}</span> : null}
      {badges.length ? (
        <button type="button" className="badges" onClick={() => ops.details(path)} title="Edit details">
          {badges.map((text) => (
            <Badge key={text}>{text}</Badge>
          ))}
        </button>
      ) : null}
      <span className="node-actions">
      {kind === 'chapter' ? (
        <select className="difficulty" value={node.difficulty} disabled={!ops.editable} onChange={(e) => ops.update(path, { difficulty: Number(e.target.value) })} aria-label="Difficulty">
          {DIFFICULTIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {kind !== 'unit' ? (
        <button type="button" className={`star${node.important ? ' on' : ''}`} aria-pressed={node.important} aria-label="Important" title={node.important ? 'Important' : 'Mark as important'} disabled={!ops.editable} onClick={() => ops.update(path, { important: !node.important })}>
          <Icon name="star" filled={node.important} />
        </button>
      ) : null}
      <button type="button" className="btn icon ghost" onClick={() => ops.details(path)} aria-label="Details" title="Weightage, marks, priority and more">
        <Icon name="more" />
      </button>
      {ops.editable ? (
        <button type="button" className="btn icon ghost danger" onClick={() => ops.remove(path)} aria-label={`Delete ${node.name || kind}`} title="Delete">
          <Icon name="trash" size={14} />
        </button>
      ) : null}
      </span>
    </div>
  )
}

