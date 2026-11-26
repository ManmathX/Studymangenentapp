import { create } from 'zustand';
import { deleteData, isLoaded, loadData, read, setSaveErrorHandler, unloadData } from '../data/db';
import { subjectInfoOf } from '../data/queries';
import { toApiError } from '../services/api/ApiError';
import { refreshSession, setSessionExpiredHandler } from '../services/api/client';
import { authApi } from '../services/api/endpoints';
import { signOutOfGoogle } from '../services/googleSignIn';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useResourceStore } from './resourceStore';
import { useOnboardingStore } from './onboardingStore';
import { setKnownSubjects } from './subjectStore';
import { toast } from './toastStore';

/** Setup is done when this account's planner on the phone has a profile. */
function plannerProfile() {
  return isLoaded() ? read().profile : null;
}

/** Opens the account's planner from this phone. Returns whether setup is done. */
async function openPlanner(user) {
  const { recovered } = await loadData(user.id);
  if (recovered) toast('Your saved plan couldn’t be read, so a fresh one was started. The old file was kept on this phone.', 'error');
  const profile = plannerProfile();
  setKnownSubjects(profile ? subjectInfoOf(profile) : []);
  return Boolean(profile);
}

/**
 * status: 'booting' while restoring a saved session, then 'signedOut' or 'signedIn'.
 * The navigator renders purely from this state. The server only knows the login; the
 * student's plan is a file on this phone, opened here for whoever signs in.
 */
export const useAuthStore = create((set, get) => ({
  status: 'booting',
  user: null,
  onboarded: false,

  async bootstrap() {
    let user = null;
    try {
      if (!(await tokenStorage.getRefreshToken())) {
        set({ status: 'signedOut' });
        return;
      }
      await refreshSession();
      ({ user } = await authApi.me());
    } catch (caught) {
      const error = toApiError(caught);
      if (!error.isNetworkError) {
        await tokenStorage.clear();
        set({ status: 'signedOut' });
        return;
      }
      // No connection: the plan is on this phone, so open it for the account signed in last.
      user = await tokenStorage.getAccount();
      if (!user) {
        set({ status: 'signedOut' });
        return;
      }
    }
    try {
      await get().startSession(user);
    } catch {
      toast('Couldn’t open your plan on this phone. Sign in to try again.', 'error');
      set({ status: 'signedOut', user: null, onboarded: false });
    }
  },

  /** Remembers the account and opens its planner. */
  async startSession(user) {
    await tokenStorage.saveAccount(user);
    const onboarded = await openPlanner(user);
    set({ status: 'signedIn', user, onboarded });
  },

  /** Signs in (or signs up) with an ID token from Google Sign-In. */
  async loginWithGoogle(idToken) {
    const session = await authApi.google(idToken);
    await tokenStorage.saveTokens(session.tokens);
    await get().startSession(session.user);
  },

  /** Signs out. The plan stays on this phone for the next time this account signs in. */
  async logout() {
    const refreshToken = await tokenStorage.getRefreshToken();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } finally {
      await get().clearSession();
    }
  },

  /** Deletes the login on the server and this account's plan on this phone. Google-only accounts send no password. */
  async deleteAccount(password) {
    const userId = get().user?.id;
    await authApi.deleteAccount(password);
    if (userId) await deleteData(userId);
    await get().clearSession();
  },

  /** Call after anything that creates, replaces or removes the plan (setup, demo, restore, start over). */
  plannerChanged() {
    useResourceStore.getState().reset();
    const profile = plannerProfile();
    setKnownSubjects(profile ? subjectInfoOf(profile) : []);
    set({ onboarded: Boolean(profile) });
  },

  async clearSession() {
    await unloadData();
    await tokenStorage.clear();
    useResourceStore.getState().reset();
    setKnownSubjects([]);
    // Half-finished setup answers (the name, subjects, tests) belong to the account signing out.
    useOnboardingStore.getState().reset();
    signOutOfGoogle();
    set({ status: 'signedOut', user: null, onboarded: false });
  },
}));

setSessionExpiredHandler(() => useAuthStore.getState().clearSession());
setSaveErrorHandler(() => toast('Couldn’t save to this phone. Free up some storage, then try again.', 'error'));
