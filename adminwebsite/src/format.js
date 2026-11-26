export function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** "2026-27 · v2" */
export const versionLabel = (version) => (version ? `${version.academicYear} · v${version.version}` : '')

/** "Class 10" or "" for exams without levels. */
export const levelName = (levels, key) => levels.find((level) => level.key === key)?.name ?? key

/** The school year a date falls in (Indian schools start in April): "2026-27". */
export function currentAcademicYear(date = new Date()) {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}
