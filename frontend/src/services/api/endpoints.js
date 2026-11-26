import { api } from './client';

/**
 * The only things the app asks the server for: the login, and the board's syllabus
 * catalogue at setup. Everything the student enters lives on the phone (see data/api.js).
 */
export const authApi = {
  login: (body) => api.post('/auth/login', body),
  google: (idToken) => api.post('/auth/google', { idToken }),
  register: (body) => api.post('/auth/register', body),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) => api.post('/auth/password', { currentPassword, newPassword }),
  forgotPassword: (email) => api.post('/auth/password/forgot', { email }),
  resetPassword: (body) => api.post('/auth/password/reset', body),
  deleteAccount: (password) => api.delete('/auth/account', password ? { password } : {}),
};

export const syllabusApi = {
  boards: () => api.get('/syllabus/boards'),
  classes: (board) => api.get('/syllabus/classes', { board }),
  forClass: (board, cls) => api.get(`/syllabus/${cls}`, { board }),
};
