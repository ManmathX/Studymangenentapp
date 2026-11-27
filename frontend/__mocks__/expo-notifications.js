/**
 * In-memory stand-in for expo-notifications in tests: scheduled notifications are kept in a
 * map, the permission can be set, and a tap can be simulated with __respond.
 */
const GRANTED = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };
const scheduled = new Map();
const listeners = new Set();
let permission = { ...GRANTED };
let lastResponse = null;
const copy = (value) => JSON.parse(JSON.stringify(value));

module.exports = {
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', DAILY: 'daily', DATE: 'date', MONTHLY: 'monthly', TIME_INTERVAL: 'timeInterval', WEEKLY: 'weekly', YEARLY: 'yearly' },
  AndroidImportance: { UNKNOWN: 0, UNSPECIFIED: 1, NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ ...permission })),
  requestPermissionsAsync: jest.fn(async () => {
    if (permission.status === 'undetermined') permission = { ...GRANTED };
    return { ...permission };
  }),
  getExactAlarmPermissionsAsync: jest.fn(async () => ({ ...GRANTED })),
  requestExactAlarmPermissionsAsync: jest.fn(async () => ({ ...GRANTED })),
  scheduleNotificationAsync: jest.fn(async ({ identifier, content, trigger }) => {
    const id = identifier ?? `notification-${scheduled.size + 1}`;
    scheduled.set(id, copy({ identifier: id, content, trigger: { ...trigger, date: trigger?.date instanceof Date ? trigger.date.getTime() : trigger?.date } }));
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id) => {
    scheduled.delete(id);
  }),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => scheduled.clear()),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled.values()].map(copy)),
  dismissNotificationAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: jest.fn((listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  }),
  getLastNotificationResponseAsync: jest.fn(async () => lastResponse),
  clearLastNotificationResponseAsync: jest.fn(async () => {
    lastResponse = null;
  }),

  __scheduled: scheduled,
  __setPermission(next) {
    permission = { ...permission, ...next };
  },
  /** Simulates the student tapping a notification (or one of its buttons). */
  __respond(response) {
    lastResponse = response;
    for (const listener of listeners) listener(response);
  },
  __reset() {
    scheduled.clear();
    permission = { ...GRANTED };
    lastResponse = null;
  },
};
