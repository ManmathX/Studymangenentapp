/**
 * Talks to the Study Planner API. Admins sign in with the same accounts as the app; only
 * accounts with the admin role (see `npm run create-admin` in backend/) get past login.
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

export async function login(email, password) {
  const data = await request('POST', '/auth/login', { email, password })
  if (data.user.role !== 'admin') {
    // Don't leave a student's session lying around in the admin portal.
    await send('POST', '/auth/logout', { refreshToken: data.tokens.refreshToken }, data.tokens.accessToken).catch(() => {})
    throw new ApiError(403, 'NOT_ADMIN', 'This account is not an admin. Ask an admin to promote it, or run `npm run create-admin` in backend/.')
  }
  saveSession({ user: data.user, accessToken: data.tokens.accessToken, refreshToken: data.tokens.refreshToken })
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

export const syllabus = {
  overview: () => request('GET', '/admin/syllabus/boards'),
  loadStandard: () => request('POST', '/admin/syllabus/standard', {}),
  createBoard: (body) => request('POST', '/admin/syllabus/boards', body),
  updateBoard: (code, patch) => request('PATCH', `/admin/syllabus/boards/${enc(code)}`, patch),
  deleteBoard: (code) => request('DELETE', `/admin/syllabus/boards/${enc(code)}`),
  subjects: (code, cls) => request('GET', `/admin/syllabus/boards/${enc(code)}/classes/${cls}/subjects`),
  createSubject: (code, cls, body) => request('POST', `/admin/syllabus/boards/${enc(code)}/classes/${cls}/subjects`, body),
  reorder: (code, cls, subjectIds) => request('PUT', `/admin/syllabus/boards/${enc(code)}/classes/${cls}/order`, { subjectIds }),
  copyClass: (code, cls, fromBoard, fromCls) => request('POST', `/admin/syllabus/boards/${enc(code)}/classes/${cls}/copy`, { fromBoard, fromCls }),
  updateSubject: (id, patch) => request('PATCH', `/admin/syllabus/subjects/${enc(id)}`, patch),
  deleteSubject: (id) => request('DELETE', `/admin/syllabus/subjects/${enc(id)}`),
}

export const CLASSES = [6, 7, 8, 9, 10, 11, 12]
export const DIFFICULTIES = [
  { value: 1, label: 'Easy' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Hard' },
]
