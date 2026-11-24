import { create } from 'zustand';
import { refreshSession, setSessionExpiredHandler } from '../services/api/client';
import { authApi } from '../services/api/endpoints';
import { signOutOfGoogle } from '../services/googleSignIn';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useResourceStore } from './resourceStore';
import { setKnownSubjects } from './subjectStore';

/**
 * status: 'booting' while restoring a saved session, then 'signedOut' or 'signedIn'.
 * The navigator renders purely from this state.
 */
export const useAuthStore = create((set, get) => ({
  status: 'booting',
  user: null,
  onboarded: false,

  async bootstrap() {
    try {
      if (!(await tokenStorage.getRefreshToken())) {
        set({ status: 'signedOut' });
        return;
      }
      await refreshSession();
      const { user, onboarded } = await authApi.me();
      set({ status: 'signedIn', user, onboarded });
    } catch (error) {
      if (!error?.isNetworkError) await tokenStorage.clear();
      set({ status: 'signedOut' });
    }
  },

  async login(credentials) {
    const session = await authApi.login(credentials);
    await tokenStorage.saveTokens(session.tokens);
    set({ status: 'signedIn', user: session.user, onboarded: session.onboarded });
  },

  /** Signs in (or signs up) with an ID token from Google Sign-In. */
  async loginWithGoogle(idToken) {
    const session = await authApi.google(idToken);
    await tokenStorage.saveTokens(session.tokens);
    set({ status: 'signedIn', user: session.user, onboarded: session.onboarded });
  },

  async register(details) {
    const session = await authApi.register(details);
    await tokenStorage.saveTokens(session.tokens);
    set({ status: 'signedIn', user: session.user, onboarded: false });
  },

  async logout() {
    const refreshToken = await tokenStorage.getRefreshToken();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } finally {
      get().clearSession();
    }
  },

  /** Signs out every other device; this one keeps working with the new token pair. Throws ApiError for forms. */
  async changePassword(currentPassword, newPassword) {
    const tokens = await authApi.changePassword(currentPassword, newPassword);
    await tokenStorage.saveTokens(tokens);
  },

  /** Permanently deletes the account on the server, then forgets the session here. Google-only accounts send no password. */
  async deleteAccount(password) {
    await authApi.deleteAccount(password);
    get().clearSession();
  },

  setOnboarded(onboarded) {
    useResourceStore.getState().reset();
    set({ onboarded });
  },

  clearSession() {
    tokenStorage.clear();
    useResourceStore.getState().reset();
    setKnownSubjects([]);
    signOutOfGoogle();
    set({ status: 'signedOut', user: null, onboarded: false });
  },
}));

setSessionExpiredHandler(() => useAuthStore.getState().clearSession());
