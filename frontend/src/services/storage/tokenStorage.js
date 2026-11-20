import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_KEY = 'studyplanner.refreshToken';

/**
 * Refresh tokens live in the iOS Keychain / Android Keystore via expo-secure-store.
 * The web build has no secure enclave, so it keeps the token in sessionStorage
 * (cleared when the tab closes). Access tokens are only ever held in memory.
 */
const webStore = {
  get: async () => globalThis.sessionStorage?.getItem(REFRESH_KEY) ?? null,
  set: async (value) => globalThis.sessionStorage?.setItem(REFRESH_KEY, value),
  remove: async () => globalThis.sessionStorage?.removeItem(REFRESH_KEY),
};

const nativeStore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: (value) => SecureStore.setItemAsync(REFRESH_KEY, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: () => SecureStore.deleteItemAsync(REFRESH_KEY),
};

const store = Platform.OS === 'web' ? webStore : nativeStore;

let accessToken = null;

export const tokenStorage = {
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  getRefreshToken: () => store.get(),
  async saveTokens({ accessToken: access, refreshToken }) {
    accessToken = access;
    await store.set(refreshToken);
  },
  async clear() {
    accessToken = null;
    await store.remove();
  },
};
