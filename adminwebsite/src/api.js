/**
 * Talks to the Study Planner API. Staff sign in with the same accounts as the app; only accounts
 * with the admin or editor role (see `npm run create-admin` in backend/) get past login.
 */
const ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '')
const BASE = `${ORIGIN}/api/v1`
const STORAGE_KEY = 'syllabus-admin-session'

export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? null
  } catch {
    return null
  }
}

let session = loadSession()
let onExpired = () => {}
let refreshing = null

function saveSession(next) {
  session = next
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private windows can refuse storage; the session then lasts until the tab closes.
  }
}

export const currentSession = () => session
export const setSessionExpiredHandler = (handler) => {
  onExpired = handler
}

async function send(method, path, body, token) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  let response
  try {
    response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'NETWORK', `Can’t reach the API at ${ORIGIN}. Is the backend running?`)
  }
  if (response.status === 204) return { response, json: null }
  const json = await response.json().catch(() => null)
  return { response, json }
}

/** Swaps the refresh token for a new pair. Concurrent callers share one refresh. */
function refreshTokens() {
  refreshing ??= (async () => {
    const { response, json } = await send('POST', '/auth/refresh', { refreshToken: session?.refreshToken })
    if (!response.ok) return false
    saveSession({ ...session, accessToken: json.data.accessToken, refreshToken: json.data.refreshToken })
    return true
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function request(method, path, body) {
  let { response, json } = await send(method, path, body, session?.accessToken)
  if (response.status === 401 && session?.refreshToken && !path.startsWith('/auth/')) {
    if (await refreshTokens()) ({ response, json } = await send(method, path, body, session.accessToken))
    else {
      saveSession(null)
      onExpired()
    }
  }
  if (!response.ok) {
    const error = json?.error
    const detail = error?.details?.[0]?.message
    throw new ApiError(response.status, error?.code ?? 'ERROR', detail && error?.code === 'VALIDATION_ERROR' ? detail : (error?.message ?? `Request failed (${response.status})`), error?.details)
  }
  return json?.data ?? null
}

/** For paged lists: `{ items, meta: { page, limit, total, hasNext } }`. */
async function requestPage(method, path) {
  let { response, json } = await send(method, path, undefined, session?.accessToken)
  if (response.status === 401 && session?.refreshToken) {
    if (await refreshTokens()) ({ response, json } = await send(method, path, undefined, session.accessToken))
    else {
      saveSession(null)
      onExpired()
    }
  }
  if (!response.ok) throw new ApiError(response.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? `Request failed (${response.status})`)
  return { items: json?.data ?? [], meta: json?.meta ?? null }
}

/** Roles that may use this portal. */
const STAFF_ROLES = ['admin', 'editor']

export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password })
  if (!STAFF_ROLES.includes(data.user.role)) {
    // Don't leave a student's session lying around in the admin portal.
    await send('POST', '/auth/logout', { refreshToken: data.tokens.refreshToken }, data.tokens.accessToken).catch(() => {})
    throw new ApiError(403, 'NOT_ADMIN', 'This account is not an admin or editor. Ask an admin to change its role on the Team page, or run `npm run create-admin` in backend/.')
  }
  saveSession({ user: data.user, accessToken: data.tokens.accessToken, refreshToken: data.tokens.refreshToken })
  return data.user
}

/** Fetches the signed-in account again: its role and permissions may have changed. */
export async function refreshUser() {
  if (!session) return null
  const data = await request('GET', '/auth/me')
  if (!STAFF_ROLES.includes(data.user.role)) {
    saveSession(null)
    return null
  }
  saveSession({ ...session, user: data.user })
  return data.user
}

export async function logout() {
  const refreshToken = session?.refreshToken
  try {
    if (refreshToken) await request('POST', '/auth/logout', { refreshToken })
  } finally {
    saveSession(null)
  }
}

const enc = encodeURIComponent
const query = (params = {}) => {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : ''
}

/** Absolute URL of a path on the API origin (logos come back as `/api/v1/...`). */
export const apiUrl = (path) => (path ? `${ORIGIN}${path}` : null)

/** Whether the signed-in account may do something (the server sends its permission list). */
export const can = (user, permission) => Boolean(user?.permissions?.includes(permission))

export const dashboard = {
  get: (filters) => request('GET', `/admin/dashboard${query(filters)}`),
}

export const categories = {
  list: () => request('GET', '/admin/exam-categories'),
  create: (body) => request('POST', '/admin/exam-categories', body),
  update: (code, patch) => request('PATCH', `/admin/exam-categories/${enc(code)}`, patch),
  remove: (code) => request('DELETE', `/admin/exam-categories/${enc(code)}`),
  reorder: (codes) => request('PUT', '/admin/exam-categories/order', { codes }),
}

export const exams = {
  /** Returns `{ items, meta }` for paging. */
  list: (params) => requestPage('GET', `/admin/exams${query(params)}`),
  get: (code) => request('GET', `/admin/exams/${enc(code)}`),
  create: (body) => request('POST', '/admin/exams', body),
  update: (code, patch) => request('PATCH', `/admin/exams/${enc(code)}`, patch),
  remove: (code) => request('DELETE', `/admin/exams/${enc(code)}`),
  reorder: (codes) => request('PUT', '/admin/exams/order', { codes }),
  setLogo: (code, dataBase64) => request('PUT', `/admin/exams/${enc(code)}/logo`, { dataBase64 }),
  removeLogo: (code) => request('DELETE', `/admin/exams/${enc(code)}/logo`),
  loadStandard: () => request('POST', '/admin/exams/standard', {}),
  versions: (code) => request('GET', `/admin/exams/${enc(code)}/syllabi`),
  createDraft: (code, body) => request('POST', `/admin/exams/${enc(code)}/syllabi`, body),
}

export const syllabi = {
  get: (id) => request('GET', `/admin/syllabi/${enc(id)}`),
  update: (id, patch) => request('PATCH', `/admin/syllabi/${enc(id)}`, patch),
  remove: (id) => request('DELETE', `/admin/syllabi/${enc(id)}`),
  publish: (id) => request('POST', `/admin/syllabi/${enc(id)}/publish`, {}),
  unpublish: (id) => request('POST', `/admin/syllabi/${enc(id)}/unpublish`, {}),
  duplicate: (id, body) => request('POST', `/admin/syllabi/${enc(id)}/duplicate`, body),
  exportFile: (id, format, level) => request('GET', `/admin/syllabi/${enc(id)}/export${query({ format, level })}`),
  importFile: (id, body) => request('POST', `/admin/syllabi/${enc(id)}/import`, body),
  subjects: (id, level) => request('GET', `/admin/syllabi/${enc(id)}/subjects${query({ level })}`),
  createSubject: (id, body) => request('POST', `/admin/syllabi/${enc(id)}/subjects`, body),
  reorderSubjects: (id, level, subjectIds) => request('PUT', `/admin/syllabi/${enc(id)}/subjects/order`, { level, subjectIds }),
  copyLevel: (id, level, fromSyllabusId, fromLevel) =>
    request('POST', `/admin/syllabi/${enc(id)}/levels/${enc(level || '-')}/copy`, { fromSyllabusId, fromLevel }),
}

export const subjects = {
  get: (id) => request('GET', `/admin/syllabus-subjects/${enc(id)}`),
  save: (id, body) => request('PUT', `/admin/syllabus-subjects/${enc(id)}`, body),
  remove: (id) => request('DELETE', `/admin/syllabus-subjects/${enc(id)}`),
}

export const users = {
  list: (params) => requestPage('GET', `/admin/users${query(params)}`),
  setRole: (id, role) => request('PATCH', `/admin/users/${enc(id)}/role`, { role }),
}

/** Saves text as a file in the browser (exports). */
export function download({ filename, contentType, content }) {
  const url = URL.createObjectURL(new Blob([content], { type: `${contentType};charset=utf-8` }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Reads a picked file as base64 (logo uploads). */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.readAsDataURL(file)
  })
}

export const DIFFICULTIES = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Hard' },
]
export const PRIORITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
export const REGIONS = [
  { value: 'national', label: 'National' },
  { value: 'state', label: 'State' },
  { value: 'international', label: 'International' },
]
export const ROLES = [
  { value: 'student', label: 'Student', hint: 'Uses the app. No access to this portal.' },
  { value: 'editor', label: 'Editor', hint: 'Edits exams, categories and draft syllabi. Can’t publish or delete.' },
  { value: 'admin', label: 'Admin', hint: 'Everything, including publishing, deleting and managing the team.' },
]
