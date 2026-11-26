/**
 * The syllabus editor's working copy of one subject: units → chapters → topics → subtopics.
 * Every node gets a `uid` while it is edited (drag-and-drop and React keys need stable ids);
 * `toSaveable` strips them before saving. A node's path is its index at each depth, e.g.
 * [unit, chapter, topic].
 */

export const CHILDREN = ['chapters', 'topics', 'subtopics']
export const KINDS = ['unit', 'chapter', 'topic', 'subtopic']
export const LIMITS = { units: 40, chapters: 150, topics: 80, subtopics: 50, nodes: 4000 }

let sequence = 0
const uid = () => `n${(sequence += 1)}`

export const newSubtopic = (name = '') => ({ uid: uid(), name, important: false })
export const newTopic = (name = '') => ({ uid: uid(), name, important: false, subtopics: [] })
export const newChapter = (name = '') => ({ uid: uid(), name, difficulty: 2, important: false, topics: [] })
export const newUnit = (name = '') => ({ uid: uid(), name, chapters: [] })
export const NEW = [newUnit, newChapter, newTopic, newSubtopic]

/** Adds uids to a subject's units as the API returns them. */
export function withUids(units) {
  return units.map((unit) => ({
    ...unit,
    uid: uid(),
    chapters: unit.chapters.map((chapter) => ({
      ...chapter,
      uid: uid(),
      topics: chapter.topics.map((topic) => ({ ...topic, uid: uid(), subtopics: topic.subtopics.map((sub) => ({ ...sub, uid: uid() })) })),
    })),
  }))
}

/**
 * Gives freshly loaded units the uids of the nodes at the same place in `previous`, so rows that
 * were open stay open after a save. New places get new uids.
 */
export function adoptUids(fresh, previous) {
  const walk = (list, old, depth) =>
    list.map((node, i) => {
      const before = old?.[i]
      const key = CHILDREN[depth]
      const next = { ...node, uid: before?.uid ?? uid() }
      if (key && Array.isArray(node[key])) next[key] = walk(node[key], before?.[key], depth + 1)
      return next
    })
  return walk(fresh, previous, 0)
}

const OPTIONAL = ['book', 'weightage', 'marks', 'priority', 'grade']

/** The units as the API takes them: no uids, cleared fields left out. */
export function toSaveable(units) {
  const clean = (node) => {
    const { uid: _uid, ...rest } = node
    for (const key of OPTIONAL) if (rest[key] === '' || rest[key] === null || rest[key] === undefined || Number.isNaN(rest[key])) delete rest[key]
    return rest
  }
  return units.map((unit) => ({
    ...clean(unit),
    chapters: unit.chapters.map((chapter) => ({
      ...clean(chapter),
      topics: chapter.topics.map((topic) => ({ ...clean(topic), subtopics: topic.subtopics.map(clean) })),
    })),
  }))
}

/** The list a node at `parentPath` holds: [] → units, [u] → chapters, [u, c] → topics, [u, c, t] → subtopics. */
export function listAt(units, parentPath) {
  let list = units
  parentPath.forEach((index, depth) => {
    list = list[index][CHILDREN[depth]]
  })
  return list
}

export function nodeAt(units, path) {
  return listAt(units, path.slice(0, -1))[path[path.length - 1]]
}

/** Replaces the list at `parentPath` with `change(list)`, copying only what is on the way. */
export function changeList(units, parentPath, change) {
  return changeChildren(units, parentPath, change, 0)
}

function changeChildren(list, parentPath, change, depth) {
  if (!parentPath.length) return change(list)
  const [index, ...rest] = parentPath
  const key = CHILDREN[depth]
  return list.map((node, i) => (i === index ? { ...node, [key]: changeChildren(node[key], rest, change, depth + 1) } : node))
}

export const updateNode = (units, path, patch) =>
  changeList(units, path.slice(0, -1), (list) => list.map((node, i) => (i === path[path.length - 1] ? { ...node, ...patch } : node)))

export const removeNode = (units, path) => changeList(units, path.slice(0, -1), (list) => list.filter((_, i) => i !== path[path.length - 1]))

export const insertNode = (units, parentPath, node, index) =>
  changeList(units, parentPath, (list) => {
    const at = index === undefined ? list.length : index
    return [...list.slice(0, at), node, ...list.slice(at)]
  })

export const moveNode = (units, path, delta) =>
  changeList(units, path.slice(0, -1), (list) => {
    const from = path[path.length - 1]
    const to = from + delta
    if (to < 0 || to >= list.length) return list
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  })

/** A deep copy with new uids, named "… (copy)". */
export function duplicateNode(node) {
  const clone = JSON.parse(JSON.stringify(node))
  const renew = (item) => {
    item.uid = uid()
    for (const key of CHILDREN) if (Array.isArray(item[key])) item[key].forEach(renew)
    return item
  }
  return { ...renew(clone), name: `${node.name} (copy)` }
}

/** How many nodes sit under `node`, by kind. */
export function descendants(node) {
  const counts = { chapters: 0, topics: 0, subtopics: 0 }
  for (const chapter of node.chapters ?? []) {
    counts.chapters += 1
    for (const topic of chapter.topics) {
      counts.topics += 1
      counts.subtopics += topic.subtopics.length
    }
  }
  for (const topic of node.topics ?? []) {
    counts.topics += 1
    counts.subtopics += topic.subtopics.length
  }
  counts.subtopics += (node.subtopics ?? []).length
  return counts
}

export function countTree(units) {
  const counts = { units: 0, chapters: 0, topics: 0, subtopics: 0 }
  for (const unit of units) {
    if (unit.name) counts.units += 1
    const below = descendants(unit)
    counts.chapters += below.chapters
    counts.topics += below.topics
    counts.subtopics += below.subtopics
  }
  return counts
}

/** Problems that stop a save, in plain words. Empty when the subject can be saved. */
export function treeProblems(name, units) {
  const problems = []
  if (!name.trim()) problems.push('Give the subject a name.')
  const counts = countTree(units)
  if (units.length > LIMITS.units) problems.push(`At most ${LIMITS.units} units.`)
  if (counts.chapters > LIMITS.chapters) problems.push(`At most ${LIMITS.chapters} chapters in a subject.`)
  if (counts.units + counts.chapters + counts.topics + counts.subtopics > LIMITS.nodes) problems.push(`At most ${LIMITS.nodes} items in a subject.`)
  let unnamed = 0
  units.forEach((unit) =>
    unit.chapters.forEach((chapter) => {
      if (!chapter.name.trim()) unnamed += 1
      if (chapter.topics.length > LIMITS.topics) problems.push(`${chapter.name}: at most ${LIMITS.topics} topics.`)
      chapter.topics.forEach((topic) => {
        if (!topic.name.trim()) unnamed += 1
        if (topic.subtopics.length > LIMITS.subtopics) problems.push(`${topic.name}: at most ${LIMITS.subtopics} subtopics.`)
        topic.subtopics.forEach((sub) => {
          if (!sub.name.trim()) unnamed += 1
        })
      })
    }),
  )
  if (unnamed) problems.push(`${unnamed} item${unnamed === 1 ? ' has' : 's have'} no name. Name or delete ${unnamed === 1 ? 'it' : 'them'}.`)
  return problems
}

/**
 * Reads an indented outline (tabs, 2+ spaces, or leading "-", "*", "1." per level) into nodes.
 * `kinds` is what each depth becomes, e.g. ['unit', 'chapter', 'topic'].
 */
export function parseOutline(text, kinds) {
  const roots = []
  const stack = []
  const problems = []
  text.split('\n').forEach((raw, index) => {
    if (!raw.trim()) return
    const indent = raw.match(/^[\t ]*/)[0].replace(/\t/g, '  ').length
    const markers = raw.trim().match(/^((?:[-*•]|\d+[.)])\s*)+/)
    let depth = Math.floor(indent / 2)
    if (!indent && markers) depth = Math.max(0, (markers[0].match(/[-*•]/g)?.length ?? 1) - 1)
    const name = raw.trim().replace(/^((?:[-*•]|\d+[.)])\s*)+/, '').trim()
    if (!name) return
    depth = Math.min(depth, stack.length)
    if (depth >= kinds.length) {
      problems.push(`Line ${index + 1} is indented deeper than ${kinds[kinds.length - 1]}s`)
      return
    }
    const kind = kinds[depth]
    const node = NEW[KINDS.indexOf(kind)](name.slice(0, kind === 'unit' || kind === 'chapter' ? 120 : 160))
    if (depth === 0) roots.push(node)
    else stack[depth - 1][CHILDREN[KINDS.indexOf(kinds[depth - 1])]].push(node)
    stack.length = depth
    stack.push(node)
  })
  return { roots, problems }
}
