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

export const syllabusApi = {
  boards: () => api.get('/syllabus/boards'),
  classes: (board) => api.get('/syllabus/classes', { board }),
  forClass: (board, cls) => api.get(`/syllabus/${cls}`, { board }),
};
