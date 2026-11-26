import { api } from './client';

/**
 * The only things the app asks the server for: the login, and the board's syllabus
 * catalogue at setup. Everything the student enters lives on the phone (see data/api.js).
 */
/** Students sign in with Google only, so the app has no email/password calls. */
export const authApi = {
  google: (idToken) => api.post('/auth/google', { idToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  deleteAccount: (password) => api.delete('/auth/account', password ? { password } : {}),
};

/**
 * The exam picker: categories, boards and competitive exams, and an exam's published syllabus
 * (per level when it has levels, e.g. CBSE classes or UPSC stages). The list is small, so the
 * app downloads it once and searches it on the phone.
 */
export const syllabusApi = {
  categories: () => api.get('/syllabus/categories'),
  exams: () => api.get('/syllabus/exams', { limit: 200 }),
  exam: (code) => api.get(`/syllabus/exams/${encodeURIComponent(code)}`),
  examSubjects: (code, level) => api.get(`/syllabus/exams/${encodeURIComponent(code)}/subjects`, level ? { level } : undefined),
  // Board-only endpoints that earlier app versions use; kept for reference.
  boards: () => api.get('/syllabus/boards'),
  classes: (board) => api.get('/syllabus/classes', { board }),
  forClass: (board, cls) => api.get(`/syllabus/${cls}`, { board }),
};
