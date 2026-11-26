import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_KEY = 'studyplanner.refreshToken';
/** The signed-in account (id, name, email…), so the plan on this phone opens offline too. */
const ACCOUNT_KEY = 'studyplanner.account';

/**
 * Refresh tokens live in the iOS Keychain / Android Keystore via expo-secure-store.
 * The web build has no secure enclave, so it keeps the token in sessionStorage
 * (cleared when the tab closes). Access tokens are only ever held in memory.
 */
const webStore = {
  get: async (key) => globalThis.sessionStorage?.getItem(key) ?? null,
  set: async (key, value) => globalThis.sessionStorage?.setItem(key, value),
  remove: async (key) => globalThis.sessionStorage?.removeItem(key),
};

const nativeStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

const store = Platform.OS === 'web' ? webStore : nativeStore;

let accessToken = null;

export const tokenStorage = {
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  getRefreshToken: () => store.get(REFRESH_KEY),
  async saveTokens({ accessToken: access, refreshToken }) {
    accessToken = access;
    await store.set(REFRESH_KEY, refreshToken);
  },
  async getAccount() {
    try {
      const account = JSON.parse((await store.get(ACCOUNT_KEY)) ?? 'null');
      return account?.id ? account : null;
    } catch {
      return null;
    }
  },
  async saveAccount({ id, name, email, role, hasPassword }) {
    await store.set(ACCOUNT_KEY, JSON.stringify({ id, name, email, role, hasPassword }));
  },
  async clear() {
    accessToken = null;
    await Promise.all([store.remove(REFRESH_KEY), store.remove(ACCOUNT_KEY)]);
  },
};
