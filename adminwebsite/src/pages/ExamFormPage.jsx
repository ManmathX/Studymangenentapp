import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { categories as categoriesApi, exams as examsApi, fileToBase64, REGIONS, syllabi as syllabiApi } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ChipsInput } from '../components/ChipsInput.jsx'
import { ExamLogo } from '../components/ExamLogo.jsx'
import { useToast } from '../components/feedback.jsx'
import { LeavePrompt } from '../components/LeavePrompt.jsx'
import { ErrorState, ErrorText, Field, Icon, LoadingState, PageHead, Toggle } from '../components/ui.jsx'
import { useLoad, useUnsavedChanges } from '../hooks.js'

const CODE = /^[a-z][a-z0-9-]{1,31}$/
const KEY = /^[a-z0-9][a-z0-9-]{0,23}$/
const SETTING_KEY = /^[a-zA-Z][a-zA-Z0-9_.-]{0,39}$/
const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const LANGUAGES = ['English', 'Hindi', 'Assamese', 'Bengali', 'Gujarati', 'Kannada', 'Malayalam', 'Marathi', 'Odia', 'Punjabi', 'Tamil', 'Telugu', 'Urdu']
const LOGO_MAX = 200 * 1024

const slug = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
const numberOrNull = (text) => (text === '' || text === null || text === undefined ? null : Number(text))
const text = (value) => (value === null || value === undefined ? '' : String(value))

/** Starting points for a new exam. Everything they fill in can still be changed. */
const KINDS = [
  { value: 'exam', label: 'Competitive exam', hint: 'One syllabus for everyone, chapters grouped into units. Turn on levels below for stages like Prelims and Mains.' },
  { value: 'state-board', label: 'State board', hint: 'Filed under school boards, with classes 6–12 and region State. Fill in the board’s name and state; start its syllabus from CBSE or another board below, or add subjects later.' },
  { value: 'school-board', label: 'Other school board', hint: 'Filed under school boards with classes 6–12, e.g. IB or Cambridge. Change the classes below if they differ.' },
]

function presetFields(kind, categories) {
  const boards = categories.find((category) => category.group === 'board')?.code
  const exams = categories.find((category) => category.group !== 'board')?.code
  if (kind === 'exam')
    return {
      category: exams ?? categories[0]?.code ?? '',
      region: 'national',
      state: '',
      hasLevels: false,
      targetGrades: [],
      structure: { levelLabel: 'Class', levels: [], useUnits: true, unitLabel: 'Unit', useTopics: true, useSubtopics: false },
    }
  return {
    category: boards ?? categories[0]?.code ?? '',
    region: kind === 'state-board' ? 'state' : 'national',
    hasLevels: true,
    targetGrades: [6, 7, 8, 9, 10, 11, 12],
    structure: { levelLabel: 'Class', levels: range(6, 12), useUnits: false, unitLabel: 'Unit', useTopics: true, useSubtopics: false },
  }
}

function blankForm(kind = 'exam', categories = []) {
  return {
    ...emptyForm(),
    ...presetFields(kind, categories),
  }
}

function emptyForm() {
  return {
    code: '',
    name: '',
    shortName: '',
    category: '',
    description: '',
    color: '#007AFF',
    conductingBody: '',
    region: 'national',
    state: '',
    eligibility: '',
    targetGrades: [],
    hasLevels: false,
    structure: { levelLabel: 'Class', levels: [], useUnits: true, unitLabel: 'Unit', useTopics: true, useSubtopics: false },
    languages: ['English'],
    isActive: true,
    position: '',
    settings: [],
    subjects: [],
    academicYear: '',
  }
}

function formFromExam(exam) {
  return {
    ...emptyForm(),
    code: exam.code,
    name: exam.name,
    shortName: exam.shortName,
    category: exam.category,
    description: exam.description,
    color: exam.color,
    conductingBody: exam.conductingBody,
    region: exam.region,
    state: exam.state,
    eligibility: exam.eligibility,
    targetGrades: exam.targetGrades,
    hasLevels: exam.structure.levels.length > 0,
    structure: { ...exam.structure, levels: exam.structure.levels.map((level) => ({ ...level, grade: text(level.grade) })) },
    languages: exam.languages,
    isActive: exam.isActive,
    position: text(exam.position),
    settings: Object.entries(exam.settings).map(([key, value]) => ({ key, type: typeof value, value: typeof value === 'boolean' ? value : String(value) })),
  }
}

/** Client-side checks, keyed like the API's error paths so both show in the same place. */
function validate(form, creating) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Give the exam a name'
  if (creating && form.region === 'state' && !form.state.trim()) errors.state = 'Name the state'
  if (form.shortName.length > 16) errors.shortName = 'At most 16 characters'
  if (creating && form.code && !CODE.test(form.code)) errors.code = '2–32 lowercase letters, numbers and dashes, starting with a letter'
  if (!form.category) errors.category = 'Pick a category'
  if (form.hasLevels) {
    if (!form.structure.levels.length) errors['structure.levels'] = 'Add at least one level, or turn levels off'
    const keys = new Set()
    form.structure.levels.forEach((level, i) => {
      if (!KEY.test(level.key)) errors[`structure.levels.${i}.key`] = 'Lowercase letters, numbers, dashes'
      else if (keys.has(level.key)) errors[`structure.levels.${i}.key`] = 'Used twice'
      keys.add(level.key)
      if (!level.name.trim()) errors[`structure.levels.${i}.name`] = 'Name it'
    })
  }
  const settingKeys = new Set()
  form.settings.forEach((setting, i) => {
    if (!SETTING_KEY.test(setting.key)) errors[`settings.${i}`] = 'Names use letters, numbers, dots, dashes and underscores'
    else if (settingKeys.has(setting.key)) errors[`settings.${i}`] = 'Used twice'
    else if (setting.type === 'number' && Number.isNaN(Number(setting.value))) errors[`settings.${i}`] = 'Not a number'
    settingKeys.add(setting.key)
  })
  if (form.academicYear && !/^20\d{2}(-\d{2})?$/.test(form.academicYear)) errors.academicYear = 'Like 2026-27 or 2027'
  return errors
}

function toBody(form, creating) {
  const body = {
    name: form.name.trim(),
    ...(form.shortName.trim() ? { shortName: form.shortName.trim() } : {}),
    category: form.category,
    description: form.description.trim(),
    color: form.color.toUpperCase(),
    conductingBody: form.conductingBody.trim(),
    region: form.region,
    state: form.region === 'state' ? form.state.trim() : '',
    eligibility: form.eligibility.trim(),
    targetGrades: form.targetGrades,
    structure: {
      levelLabel: form.structure.levelLabel.trim() || 'Level',
      levels: form.hasLevels ? form.structure.levels.map((level) => ({ key: level.key, name: level.name.trim(), grade: numberOrNull(level.grade) })) : [],
      useUnits: form.structure.useUnits,
      unitLabel: form.structure.unitLabel.trim() || 'Unit',
      useTopics: form.structure.useTopics,
      useSubtopics: form.structure.useTopics && form.structure.useSubtopics,
    },
    languages: form.languages,
    isActive: form.isActive,
    ...(form.position !== '' ? { position: Number(form.position) } : {}),
    settings: Object.fromEntries(form.settings.map((s) => [s.key, s.type === 'number' ? Number(s.value) : s.type === 'boolean' ? Boolean(s.value) : String(s.value)])),
  }
  if (creating) {
    if (form.code) body.code = form.code
    if (form.subjects.length) body.subjects = form.subjects.map((name) => ({ name }))
    if (form.academicYear) body.academicYear = form.academicYear
  }
  return body
}

export function ExamFormPage() {
  const { code } = useParams()
  const creating = !code
  const existing = useLoad(() => (code ? examsApi.get(code) : Promise.resolve(null)), [code])
  const categories = useLoad(categoriesApi.list, [])
  if ((!creating && !existing.data) || !categories.data)
    return (
      <>
        <PageHead title={creating ? 'Add an exam' : 'Edit exam'} crumbs={<Link to="/exams">Exams</Link>} />
        <ErrorState error={existing.error || categories.error} onRetry={existing.error ? existing.reload : categories.reload} />
        {existing.loading || categories.loading ? <LoadingState rows={6} /> : null}
      </>
    )
  return <ExamForm key={code ?? 'new'} exam={existing.data} categories={categories.data} />
}

function ExamForm({ exam, categories }) {
  const creating = !exam
  const navigate = useNavigate()
  const toast = useToast()
  const { can } = useAuth()
  const [params] = useSearchParams()
  const [kind, setKind] = useState(() => (KINDS.some((item) => item.value === params.get('kind')) ? params.get('kind') : 'exam'))
  const [initial] = useState(() => (exam ? formFromExam(exam) : blankForm(kind, categories)))
  const [form, setForm] = useState(initial)
  // New boards can start from a published board's syllabus, class by class.
  const [startFrom, setStartFrom] = useState('')
  const allExams = useLoad(() => (creating ? examsApi.list({ limit: 100 }).then((page) => page.items) : Promise.resolve([])), [creating])
  const boardSources = { data: (allExams.data ?? []).filter((item) => item.syllabus.published && item.structure.levels.some((level) => level.grade)) }
  // A state board's code is its state ("sikkim") when that is free, like the boards that come built in.
  const stateCode = slug(form.state).slice(0, 32)
  const suggestedCode =
    kind === 'state-board' && CODE.test(stateCode) && !(allExams.data ?? []).some((item) => item.code === stateCode) ? stateCode : slug(form.shortName || form.name).slice(0, 32)
  const isBoard = kind !== 'exam'
  const [logoFile, setLogoFile] = useState(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || Boolean(logoFile) || removeLogo
  const blocker = useUnsavedChanges(dirty && !saving)
  const errors = { ...(tried ? validate(form, creating) : {}), ...serverErrors }
  const writable = can('catalog:write')

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile])
  useEffect(() => () => logoPreview && URL.revokeObjectURL(logoPreview), [logoPreview])

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))
  const setIn = (key, patch) => setForm((current) => ({ ...current, [key]: { ...current[key], ...patch } }))
  const levels = form.structure.levels
  const setLevels = (next) => setIn('structure', { levels: next })

  const save = async (event) => {
    event.preventDefault()
    setTried(true)
    setServerErrors({})
    setError(null)
    const problems = validate(form, creating)
    if (Object.keys(problems).length) {
      setError('Fix the highlighted fields.')
      return
    }
    setSaving(true)
    try {
      const body = toBody(creating && !form.code && CODE.test(suggestedCode) ? { ...form, code: suggestedCode } : form, creating)
      const created = creating ? await examsApi.create(body) : null
      const saved = created ? created.exam : await examsApi.update(exam.code, body)
      if (logoFile) await examsApi.setLogo(saved.code, await fileToBase64(logoFile))
      else if (removeLogo && exam?.logoUrl) await examsApi.removeLogo(saved.code)
      const source = created && startFrom ? (boardSources.data ?? []).find((item) => item.code === startFrom) : null
      if (source) {
        // Copy each class both boards have into the new board's first draft.
        const shared = saved.structure.levels.filter((level) => source.structure.levels.some((other) => other.key === level.key))
        let copied = 0
        for (const level of shared) copied += (await syllabiApi.copyLevel(created.draftId, level.key, source.syllabus.published.id, level.key)).added
        toast(`${saved.name} added. Its draft starts with ${copied} subject${copied === 1 ? '' : 's'} from ${source.shortName}; review them, then publish.`)
        navigate(`/syllabi/${created.draftId}`, { replace: true })
        return
      }
      toast(creating ? `${saved.name} added with a first draft syllabus.` : `${saved.name} saved.`)
      navigate(`/exams/${saved.code}`, { replace: creating })
    } catch (caught) {
      const mapped = Object.fromEntries((caught.details ?? []).map((detail) => [detail.path.replace(/^body\./, ''), detail.message]))
      setServerErrors(mapped)
      setError(caught.message)
      setSaving(false)
    }
  }

  const pickLogo = (file) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Use a PNG, JPEG or WebP image for the logo.')
      return
    }
    if (file.size > LOGO_MAX) {
      setError('The logo must be at most 200 kB.')
      return
    }
    setError(null)
    setRemoveLogo(false)
    setLogoFile(file)
  }

  const previewExam = { ...exam, name: form.name, shortName: form.shortName || form.name, color: form.color, logoUrl: removeLogo ? null : exam?.logoUrl }

  return (
    <form onSubmit={save} noValidate>
      <LeavePrompt blocker={blocker} />
      <PageHead
        crumbs={
          <>
            <Link to="/exams">Exams</Link> › {creating ? 'New' : <Link to={`/exams/${exam.code}`}>{exam.name}</Link>}
          </>
        }
        title={creating ? (kind === 'state-board' ? 'Add a state board' : kind === 'school-board' ? 'Add a school board' : 'Add an exam') : `Edit ${exam.name}`}
        lead={creating ? 'It gets a draft syllabus to fill in. Students see it once that is published.' : null}
        actions={
          <>
            <Link className="btn ghost" to={creating ? '/exams' : `/exams/${exam.code}`}>
              Cancel
            </Link>
            <button className="btn primary" disabled={saving || !writable}>
              {saving ? 'Saving…' : creating ? (isBoard ? 'Add board' : 'Add exam') : 'Save changes'}
            </button>
          </>
        }
      />
      <ErrorText>{error}</ErrorText>

      {creating ? (
        <section className="card form-section">
          <h2>What are you adding?</h2>
          <div className="segmented" role="radiogroup" aria-label="What are you adding">
            {KINDS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={kind === item.value}
                className={kind === item.value ? 'on' : ''}
                onClick={() => {
                  setKind(item.value)
                  setStartFrom('')
                  setForm((current) => ({ ...current, ...presetFields(item.value, categories), state: item.value === 'state-board' ? current.state : '' }))
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="muted small">{KINDS.find((item) => item.value === kind)?.hint}</p>
          {kind !== 'exam' && boardSources.data?.length ? (
            <Field label="Start its syllabus from" hint="Copies the subjects and chapters of every class both boards have into the first draft. You can edit them before publishing." className="narrow-wide">
              <select value={startFrom} onChange={(e) => setStartFrom(e.target.value)}>
                <option value="">Nothing: I’ll add subjects myself</option>
                {boardSources.data.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name} ({item.syllabus.published.academicYear})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </section>
      ) : null}

      <section className="card form-section">
        <h2>Basics</h2>
        {creating && kind === 'state-board' ? (
          <Field label="State" hint="Students can find the board by its state" error={errors.state} className="narrow-wide">
            <input value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="Odisha" maxLength={60} autoFocus />
          </Field>
        ) : null}
        <div className="form-grid-2">
          <Field label={creating && isBoard ? 'Board name' : 'Exam name'} error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={kind === 'state-board' ? `${form.state.trim() || 'Odisha'} Board (BSE)` : kind === 'school-board' ? 'Cambridge (CAIE)' : 'Joint Entrance Examination (Main)'}
              maxLength={80}
              required
            />
          </Field>
          <Field label="Short name" hint="Shown on badges and in tight spaces" error={errors.shortName}>
            <input value={form.shortName} onChange={(e) => set({ shortName: e.target.value })} placeholder={kind === 'exam' ? 'JEE Main' : 'BSE Odisha'} maxLength={16} />
          </Field>
          {creating ? (
            <Field label="Code" hint="Permanent: students’ phones store it" error={errors.code}>
              <input value={form.code} onChange={(e) => set({ code: e.target.value.toLowerCase() })} placeholder={suggestedCode || (isBoard ? 'sikkim' : 'jee-main')} maxLength={32} />
            </Field>
          ) : (
            <Field label="Code" hint="Codes can’t change">
              <input value={exam.code} disabled />
            </Field>
          )}
          <Field label="Category" error={errors.category}>
            <select value={form.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">Pick one</option>
              {categories.map((category) => (
                <option key={category.code} value={category.code}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} placeholder="What the exam is for, shown to students when they pick it" />
        </Field>
        <div className="logo-row">
          <div className="logo-preview">{logoPreview ? <img className="exam-logo" src={logoPreview} alt="New logo" style={{ width: 56, height: 56, borderRadius: 14 }} /> : <ExamLogo exam={previewExam} size={56} />}</div>
          <Field label="Logo" hint="PNG, JPEG or WebP, square, at most 200 kB. Without one, a badge with the short name is shown.">
            <div className="row">
              <label className="btn">
                <Icon name="upload" /> {exam?.logoUrl || logoFile ? 'Replace' : 'Upload'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
              </label>
              {(exam?.logoUrl && !removeLogo) || logoFile ? (
                <button
                  type="button"
                  className="btn ghost danger"
                  onClick={() => {
                    setLogoFile(null)
                    setRemoveLogo(Boolean(exam?.logoUrl))
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </Field>
          <Field label="Colour">
            <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} />
          </Field>
        </div>
        <div className="form-grid-2">
          <Field label="Conducting body">
            <input value={form.conductingBody} onChange={(e) => set({ conductingBody: e.target.value })} placeholder="National Testing Agency (NTA)" maxLength={120} />
          </Field>
          <div className="row">
            <Field label="Region" className="grow">
              <select value={form.region} onChange={(e) => set({ region: e.target.value })}>
                {REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.region === 'state' && !(creating && kind === 'state-board') ? (
              <Field label="State" error={errors.state} className="grow">
                <input value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="Odisha" maxLength={60} />
              </Field>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card form-section">
        <h2>Who it is for</h2>
        <Field label="Target classes" hint="Classes that usually prepare for it">
          <div className="grade-picker" role="group" aria-label="Target classes">
            {GRADES.map((grade) => {
              const on = form.targetGrades.includes(grade)
              return (
                <button
                  key={grade}
                  type="button"
                  className={`grade${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() => set({ targetGrades: on ? form.targetGrades.filter((g) => g !== grade) : [...form.targetGrades, grade].sort((a, b) => a - b) })}
                >
                  {grade}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Eligibility">
          <textarea rows={2} value={form.eligibility} onChange={(e) => set({ eligibility: e.target.value })} maxLength={1000} placeholder="Passed or appearing in Class 12 with Physics, Chemistry and Mathematics" />
        </Field>
      </section>

      <section className="card form-section">
        <h2>Syllabus structure</h2>
        <p className="muted small">Every syllabus has subjects and chapters. Choose which other parts this exam uses and what they are called.</p>
        <Toggle
          checked={form.hasLevels}
          onChange={(on) => set({ hasLevels: on })}
          label="Separate syllabus per level"
          hint="Classes (CBSE) or stages (UPSC Prelims and Mains). Students pick a level after the exam."
        />
        {form.hasLevels ? (
          <div className="nested">
            <div className="row">
              <Field label="A level is called" className="narrow">
                <input value={form.structure.levelLabel} onChange={(e) => setIn('structure', { levelLabel: e.target.value })} placeholder="Class" maxLength={24} />
              </Field>
              <span className="grow" />
              <button type="button" className="btn" onClick={() => setLevels(range(6, 12))}>
                Classes 6–12
              </button>
              <button type="button" className="btn" onClick={() => setLevels(range(11, 12))}>
                Classes 11–12
              </button>
            </div>
            <ErrorText>{errors['structure.levels']}</ErrorText>
            <table className="table compact">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>School class</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {levels.map((level, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={level.name}
                        aria-label={`Level ${i + 1} name`}
                        aria-invalid={Boolean(errors[`structure.levels.${i}.name`])}
                        onChange={(e) => setLevels(levels.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))}
                        onBlur={() => !level.key && setLevels(levels.map((l, j) => (j === i ? { ...l, key: slug(l.grade || l.name).slice(0, 24) } : l)))}
                        placeholder="Prelims"
                      />
                      <small className="error">{errors[`structure.levels.${i}.name`]}</small>
                    </td>
                    <td>
                      <input value={level.key} aria-label={`Level ${i + 1} key`} onChange={(e) => setLevels(levels.map((l, j) => (j === i ? { ...l, key: e.target.value.toLowerCase() } : l)))} placeholder="prelims" />
                      <small className="error">{errors[`structure.levels.${i}.key`]}</small>
                    </td>
                    <td>
                      <select value={level.grade} aria-label={`Level ${i + 1} class`} onChange={(e) => setLevels(levels.map((l, j) => (j === i ? { ...l, grade: e.target.value } : l)))}>
                        <option value="">Not a class</option>
                        {GRADES.map((grade) => (
                          <option key={grade} value={grade}>
                            Class {grade}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="btn icon ghost danger" aria-label={`Remove level ${level.name}`} onClick={() => setLevels(levels.filter((_, j) => j !== i))}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn" onClick={() => setLevels([...levels, { key: '', name: '', grade: '' }])}>
              <Icon name="plus" /> Add level
            </button>
            {!creating ? <p className="muted small">A level the current draft or published syllabus uses can’t be removed until its subjects are moved or deleted.</p> : null}
          </div>
        ) : null}
        <Toggle checked={form.structure.useUnits} onChange={(on) => setIn('structure', { useUnits: on })} label="Group chapters into units" hint="JEE units, NEET Botany/Zoology, UPSC sections" />
        {form.structure.useUnits ? (
          <div className="nested">
            <Field label="A unit is called" className="narrow">
              <input value={form.structure.unitLabel} onChange={(e) => setIn('structure', { unitLabel: e.target.value })} placeholder="Unit" maxLength={24} />
            </Field>
          </div>
        ) : null}
        <Toggle checked={form.structure.useTopics} onChange={(on) => setIn('structure', { useTopics: on })} label="Topics under chapters" />
        <Toggle checked={form.structure.useTopics && form.structure.useSubtopics} disabled={!form.structure.useTopics} onChange={(on) => setIn('structure', { useSubtopics: on })} label="Subtopics under topics" />
      </section>

      <section className="card form-section">
        <h2>Languages</h2>
        <ChipsInput values={form.languages} onChange={(languages) => set({ languages })} suggestions={LANGUAGES} placeholder="Type a language and press Enter" label="Languages" max={30} />
      </section>

      {creating ? (
        <section className="card form-section">
          <h2>Subjects</h2>
          <p className="muted small">Added to the first draft{form.hasLevels ? ', at every level' : ''}. You can add, rename and remove subjects in the syllabus editor.</p>
          <ChipsInput values={form.subjects} onChange={(subjects) => set({ subjects })} suggestions={['Physics', 'Chemistry', 'Mathematics', 'Biology', 'English', 'General Studies']} placeholder="Type a subject and press Enter" label="Subjects" />
          <Field label="Academic year of the first draft" hint="Leave empty for the current school year" error={errors.academicYear} className="narrow">
            <input value={form.academicYear} onChange={(e) => set({ academicYear: e.target.value.trim() })} placeholder="2026-27 or 2027" />
          </Field>
        </section>
      ) : null}

      <section className="card form-section">
        <h2>Status and order</h2>
        <Toggle checked={form.isActive} onChange={(on) => set({ isActive: on })} label="Active" hint="Inactive exams are hidden from students even when published" />
        <Field label="Display order" hint="Lower comes first within the category. You can also drag exams on the Exams page." className="narrow">
          <input type="number" min={0} max={9999} value={form.position} onChange={(e) => set({ position: e.target.value })} placeholder="Last" />
        </Field>
      </section>

      <section className="card form-section">
        <h2>Exam-specific settings</h2>
        <p className="muted small">Anything else this exam needs, as named values (for example calculatorAllowed: no, or sessionsPerYear: 2).</p>
        {form.settings.map((setting, i) => {
          const update = (patch) => set({ settings: form.settings.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
          return (
            <div key={i} className="setting-row">
              <input value={setting.key} aria-label={`Setting ${i + 1} name`} onChange={(e) => update({ key: e.target.value })} placeholder="sessionsPerYear" />
              <select value={setting.type} aria-label={`Setting ${i + 1} type`} onChange={(e) => update({ type: e.target.value, value: e.target.value === 'boolean' ? false : '' })}>
                <option value="string">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Yes / no</option>
              </select>
              {setting.type === 'boolean' ? (
                <select value={setting.value ? 'yes' : 'no'} aria-label={`Setting ${i + 1} value`} onChange={(e) => update({ value: e.target.value === 'yes' })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : (
                <input value={setting.value} aria-label={`Setting ${i + 1} value`} type={setting.type === 'number' ? 'number' : 'text'} onChange={(e) => update({ value: e.target.value })} maxLength={300} />
              )}
              <button type="button" className="btn icon ghost danger" aria-label="Remove setting" onClick={() => set({ settings: form.settings.filter((_, j) => j !== i) })}>
                <Icon name="trash" />
              </button>
              <small className="error">{errors[`settings.${i}`]}</small>
            </div>
          )
        })}
        <button type="button" className="btn" onClick={() => set({ settings: [...form.settings, { key: '', type: 'string', value: '' }] })} disabled={form.settings.length >= 30}>
          <Icon name="plus" /> Add setting
        </button>
      </section>

      <div className="form-footer">
        <ErrorText>{error}</ErrorText>
        <span className="grow" />
        <Link className="btn ghost" to={creating ? '/exams' : `/exams/${exam.code}`}>
          Cancel
        </Link>
        <button className="btn primary" disabled={saving || !writable}>
          {saving ? 'Saving…' : creating ? (isBoard ? 'Add board' : 'Add exam') : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ key: String(from + i), name: `Class ${from + i}`, grade: String(from + i) }))
