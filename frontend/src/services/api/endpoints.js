import { api } from './client';

/** Every backend endpoint the app uses, grouped by feature. Screens never build URLs themselves. */
export const authApi = {
  login: (body) => api.post('/auth/login', body),
  register: (body) => api.post('/auth/register', body),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) => api.post('/auth/password', { currentPassword, newPassword }),
  deleteAccount: (password) => api.delete('/auth/account', { password }),
};

export const syllabusApi = {
  classes: () => api.get('/syllabus/classes'),
  forClass: (cls) => api.get(`/syllabus/${cls}`),
};

export const profileApi = {
  onboard: (body) => api.post('/onboarding', body),
  loadDemo: (timezone) => api.post('/onboarding/demo', { timezone }),
  get: () => api.get('/profile'),
  update: (patch) => api.patch('/profile', patch),
  wipe: () => api.delete('/profile/data'),
};

export const dashboardApi = {
  today: () => api.get('/dashboard/today'),
  progress: () => api.get('/dashboard/progress'),
  habits: () => api.get('/dashboard/habits'),
  sharing: () => api.get('/dashboard/sharing'),
};

export const planApi = {
  strip: (days = 14) => api.get('/plan/days', { days }),
  day: (date) => api.get(`/plan/days/${date}`),
  autoSchedule: () => api.post('/plan/auto-schedule'),
  acceptAll: () => api.post('/plan/accept-all'),
};

export const chaptersApi = {
  list: (subject) => api.get('/chapters', subject ? { subject } : undefined),
  setStatus: (key, status) => api.patch(`/chapters/${key}`, { status }),
  proposal: (key) => api.get(`/chapters/${key}/schedule-proposal`),
  schedule: (key, steps) => api.post(`/chapters/${key}/schedule`, { steps }),
  addRevision: (key) => api.post(`/chapters/${key}/revisions`),
  snooze: (key) => api.post(`/chapters/${key}/snooze`),
};

export const tasksApi = {
  update: (id, patch) => api.patch(`/tasks/${id}`, patch),
  accept: (id) => api.post(`/tasks/${id}/accept`),
  skip: (id) => api.post(`/tasks/${id}/skip`),
  swap: (id) => api.post(`/tasks/${id}/swap`),
  move: (id) => api.post(`/tasks/${id}/move`),
};

export const suggestionsApi = {
  accept: (id) => api.post(`/suggestions/${id}/accept`),
  later: (id) => api.post(`/suggestions/${id}/later`),
  skip: (id) => api.post(`/suggestions/${id}/skip`),
  swap: (id) => api.post(`/suggestions/${id}/swap`),
};

export const examsApi = {
  upcoming: () => api.get('/exams'),
  create: (body) => api.post('/exams', body),
  remove: (id) => api.delete(`/exams/${id}`),
};

export const homeworkApi = {
  page: (status, page, limit = 20) => api.getPage('/homework', { status, page, limit }),
  summary: () => api.get('/homework/summary'),
  create: (body) => api.post('/homework', body),
  setDone: (id, done) => api.patch(`/homework/${id}`, { done }),
  remove: (id) => api.delete(`/homework/${id}`),
};

export const habitsApi = {
  logFocus: (subject, mins) => api.post('/focus-sessions', { subject, mins }),
  takeRestDay: () => api.post('/daily-logs/today/rest'),
  saveCheckin: (body) => api.put('/daily-logs/today/checkin', body),
  saveRoutines: (body) => api.put('/daily-logs/today/routines', body),
  bag: (date) => api.get('/bag', date ? { date } : undefined),
  setBagItem: (date, itemId, checked) => api.put(`/bag/${date}/items/${itemId}`, { checked }),
};
