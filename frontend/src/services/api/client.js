import axios from 'axios';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../../config/env';
import { tokenStorage } from '../storage/tokenStorage';
import { toApiError } from './ApiError';

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];
const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_MISSING']);

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

let onSessionExpired = () => {};
let refreshInFlight = null;

/** Called once by the auth store so an unrecoverable 401 signs the user out. */
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

/**
 * Exchanges the stored refresh token for a new pair. Concurrent callers share one
 * request, because the server rotates (and invalidates) the token on every use.
 */
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) throw toApiError({ response: { status: 401, data: { error: { code: 'REFRESH_MISSING', message: 'Please sign in again.' } } } });
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken }, { timeout: REQUEST_TIMEOUT_MS });
      const tokens = response.data.data;
      await tokenStorage.saveTokens(tokens);
      return tokens.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

http.interceptors.request.use((config) => {
  const token = tokenStorage.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const isAuthCall = AUTH_PATHS.some((path) => original?.url?.endsWith(path));
    if (status === 401 && original && !original._retried && !isAuthCall && REFRESHABLE_CODES.has(code)) {
      original._retried = true;
      try {
        const accessToken = await refreshSession();
        original.headers.Authorization = `Bearer ${accessToken}`;
        return http(original);
      } catch (refreshError) {
        const apiError = toApiError(refreshError);
        if (!apiError.isNetworkError) {
          await tokenStorage.clear();
          onSessionExpired();
        }
        throw apiError;
      }
    }
    throw toApiError(error);
  },
);

/** Unwraps the `{ success, data, meta }` envelope. */
export async function request(method, url, { body, params } = {}) {
  const response = await http.request({ method, url, data: body, params });
  if (response.status === 204) return { data: null, meta: null };
  return { data: response.data.data, meta: response.data.meta ?? null };
}

export const api = {
  get: (url, params) => request('get', url, { params }).then((result) => result.data),
  getPage: (url, params) => request('get', url, { params }),
  post: (url, body) => request('post', url, { body }).then((result) => result.data),
  put: (url, body) => request('put', url, { body }).then((result) => result.data),
  patch: (url, body) => request('patch', url, { body }).then((result) => result.data),
  delete: (url, body) => request('delete', url, { body }).then((result) => result.data),
};
