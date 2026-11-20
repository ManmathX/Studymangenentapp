import { Platform } from 'react-native';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL for devices and deployed builds.
 * Defaults reach a backend on the development machine: the Android emulator sees
 * the host as 10.0.2.2, while iOS simulator and web use localhost.
 */
const fallbackHost = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || fallbackHost).replace(/\/$/, '');
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
export const REQUEST_TIMEOUT_MS = 15000;
/** Cached screen data younger than this is shown without refetching on focus. */
export const STALE_AFTER_MS = 30000;
