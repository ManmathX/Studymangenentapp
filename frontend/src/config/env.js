import { Platform } from 'react-native';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL for devices and deployed builds.
 * Defaults reach a backend on the development machine: the Android emulator sees
 * the host as 10.0.2.2, while iOS simulator and web use localhost.
 */
const fallbackHost = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

const configured = process.env.EXPO_PUBLIC_API_URL;

export const API_ORIGIN = (configured || fallbackHost).replace(/\/$/, '');

// Release builds must be pointed at a real, encrypted API. Fail loudly in the logs if not.
if (!__DEV__) {
  if (!configured) console.error(`EXPO_PUBLIC_API_URL was not set at build time; this build calls ${API_ORIGIN}.`);
  else if (!API_ORIGIN.startsWith('https://')) console.error(`EXPO_PUBLIC_API_URL should use https in release builds (got ${API_ORIGIN}).`);
}
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
export const REQUEST_TIMEOUT_MS = 15000;
/** Cached screen data younger than this is shown without refetching on focus. */
export const STALE_AFTER_MS = 30000;
