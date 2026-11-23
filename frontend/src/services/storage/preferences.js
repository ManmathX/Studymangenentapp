import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small per-device settings (not secrets). Native uses the platform key store that the app
 * already depends on; web uses localStorage. Reads fail soft so a blocked store never breaks start-up.
 */
const PREFIX = 'studyplanner.pref.';

const web = {
  get: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  set: async (key, value) => globalThis.localStorage?.setItem(key, value),
};

const native = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
};

const store = Platform.OS === 'web' ? web : native;

export const preferences = {
  async get(name) {
    try {
      return await store.get(`${PREFIX}${name}`);
    } catch {
      return null;
    }
  },
  async set(name, value) {
    try {
      await store.set(`${PREFIX}${name}`, value);
    } catch {
      // Not persisted this time; the in-memory value still applies for this session.
    }
  },
};
