import { create } from 'zustand';

/**
 * What this phone allows for reminders (see services/notifications.js).
 * - permission: 'unknown' until checked, then 'granted', 'denied', 'undetermined' (never asked),
 *   or 'unsupported' (the web app).
 * - canAskAgain: false once the phone won't show the prompt again; the student then turns
 *   notifications on in the phone's settings.
 * - exactTimes: Android 12+ only; without it reminders can arrive a few minutes late.
 */
export const useNotificationStore = create(() => ({
  permission: 'unknown',
  canAskAgain: true,
  exactTimes: true,
}));
