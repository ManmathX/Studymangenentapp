import * as Notifications from 'expo-notifications';
import { AppState, Linking, Platform } from 'react-native';
import { remindersApi } from '../data/api';
import { clock } from '../data/clock';
import { isLoaded } from '../data/db';
import { localToday } from '../data/queries';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { useResourceStore } from '../store/resourceStore';
import { subjectInfo } from '../store/subjectStore';
import { BREAK_MINS, isActive, useTimerStore } from '../store/timerStore';
import { toast } from '../store/toastStore';
import { habitActions } from './actions';

/**
 * Reminders as local notifications. The phone sets them itself from the plan
 * (data/reminders.js); nothing goes through the server, so they work offline and the plan
 * stays private. They are set again after every change, when the app comes back to the
 * front, and when someone signs in or out, so they always match the plan on screen.
 *
 * The web app has no scheduled notifications, so everything here does nothing there.
 */
export const notificationsSupported = Platform.OS !== 'web';

/** Identifiers: plan reminders start with this; the focus timer has one of its own. */
const PLAN_PREFIX = 'plan:';
const FOCUS_ID = 'focus:timer';
/** Changes come in bursts (an action, then screens reloading), so reminders are set once they settle. */
const SYNC_DELAY_MS = 600;

// Both enums come through the package's `export *` chain, which eslint-plugin-import can't follow.
// eslint-disable-next-line import/namespace
const { AndroidImportance = {}, IosAuthorizationStatus = {} } = Notifications;

/** Android channels, one per group, so students can also mute a group in the phone's settings. */
const CHANNELS = {
  study: { name: 'Study reminders', description: 'Before each study slot, the morning plan and packing your bag.', importance: AndroidImportance.HIGH },
  tests: { name: 'Tests and homework', description: 'The evening before tests and homework, and when marks come back.', importance: AndroidImportance.HIGH },
  focus: { name: 'Focus timer and habits', description: 'When a focus session or break ends, and habits at their set time.', importance: AndroidImportance.HIGH },
  nudges: { name: 'Streak and weekly review', description: 'The evening streak nudge, the weekly review and the come-back reminder.', importance: AndroidImportance.DEFAULT },
};
const CHANNEL_OF = { slots: 'study', morning: 'study', bag: 'study', tests: 'tests', focus: 'focus', timer: 'focus', streak: 'nudges', weekly: 'nudges' };

/** Buttons on a reminder. Both open the app: iOS doesn't reliably run the app for a button that doesn't. */
const START_FOCUS = 'startFocus';
const MARK_DONE = 'markDone';
const CATEGORIES = {
  studySlot: [{ identifier: START_FOCUS, buttonTitle: 'Start focus', options: { opensAppToForeground: true } }],
  habit: [{ identifier: MARK_DONE, buttonTitle: 'Mark done', options: { opensAppToForeground: true } }],
};
const FOCUS_SCREEN = { screen: 'Habits', section: 'habits' };

if (notificationsSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // With the app open, the focus timer already says when it ends.
      const quiet = notification.request.content.data?.kind === 'timer';
      return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: false };
    },
  });
}

/* ---------- Channels, buttons and permission ---------- */

let setup = null;
/** Channels must exist before Android 13+ will show the permission prompt. */
function ensureSetup() {
  setup ??= (async () => {
    if (Platform.OS === 'android') {
      await Promise.all(Object.entries(CHANNELS).map(([id, channel]) => Notifications.setNotificationChannelAsync(id, channel)));
    }
    await Promise.all(Object.entries(CATEGORIES).map(([id, actions]) => Notifications.setNotificationCategoryAsync(id, actions)));
  })().catch(() => {
    // Without them reminders still arrive, on the default channel and without buttons.
  });
  return setup;
}

function permissionFrom(result) {
  const ios = result?.ios?.status;
  const allowed = [IosAuthorizationStatus.AUTHORIZED, IosAuthorizationStatus.PROVISIONAL, IosAuthorizationStatus.EPHEMERAL];
  const granted = Boolean(result?.granted) || (ios !== undefined && allowed.includes(ios));
  return { permission: granted ? 'granted' : result?.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: result?.canAskAgain !== false };
}

/** Reads what the phone allows now (the student may have changed it in the phone's settings). */
export async function refreshPermission() {
  if (!notificationsSupported) {
    useNotificationStore.setState({ permission: 'unsupported', canAskAgain: false, exactTimes: true });
    return 'unsupported';
  }
  let state;
  try {
    state = permissionFrom(await Notifications.getPermissionsAsync());
  } catch {
    state = { permission: 'denied', canAskAgain: false };
  }
  let exactTimes = true;
  if (Platform.OS === 'android') {
    try {
      exactTimes = Boolean((await Notifications.getExactAlarmPermissionsAsync()).granted);
    } catch {
      exactTimes = true;
    }
  }
  useNotificationStore.setState({ ...state, exactTimes });
  return state.permission;
}

/**
 * Shows the phone's "Allow notifications?" prompt, or opens the app's page in the phone's
 * settings when the phone won't ask again. Returns the permission afterwards.
 */
export async function enableNotifications() {
  if (!notificationsSupported) return 'unsupported';
  await ensureSetup();
  const { permission, canAskAgain } = useNotificationStore.getState();
  if (permission === 'denied' && !canAskAgain) {
    await Linking.openSettings().catch(() => {});
    return permission;
  }
  try {
    const state = permissionFrom(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
    useNotificationStore.setState(state);
    requestSync();
    return state.permission;
  } catch {
    return refreshPermission();
  }
}

/** Android 12+: opens the setting that lets reminders arrive on the minute. */
export async function allowExactTimes() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.requestExactAlarmPermissionsAsync();
  } catch {
    // The setting couldn't be opened; reminders still arrive, a little late at most.
  }
  await refreshPermission();
  requestSync();
}

/* ---------- Plan reminders ---------- */

const plannerOpen = () => {
  const { status, onboarded } = useAuthStore.getState();
  return status === 'signedIn' && onboarded && isLoaded();
};

/** Changes whenever anything the student would see changes, so only those reminders are set again. */
const fingerprint = (item) => JSON.stringify([item.at, item.title, item.body, item.category, item.open]);

function contentOf(item, fp) {
  return {
    title: item.title,
    body: item.body,
    sound: 'default',
    data: { kind: item.kind, date: item.date, open: item.open, subject: item.subject, habitId: item.habitId, fp },
    ...(item.category ? { categoryIdentifier: item.category } : {}),
    // iOS groups each kind together in Notification Centre.
    ...(Platform.OS === 'ios' ? { threadIdentifier: item.kind } : {}),
  };
}

/** Makes the phone's plan reminders exactly `wanted`: adds new ones, replaces changed ones, cancels the rest. */
async function applyReminders(wanted) {
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((request) => request.identifier.startsWith(PLAN_PREFIX));
  const wantedPrints = new Map(wanted.map((item) => [item.id, fingerprint(item)]));
  const upToDate = new Set();
  for (const request of scheduled) {
    if (wantedPrints.get(request.identifier) === request.content?.data?.fp) upToDate.add(request.identifier);
    else await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  const now = clock.now().getTime();
  for (const item of wanted) {
    if (upToDate.has(item.id) || item.at <= now) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content: contentOf(item, wantedPrints.get(item.id)),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.at, channelId: CHANNEL_OF[item.kind] },
      });
    } catch {
      // One reminder the phone refused (a time already passed); the rest still go in.
    }
  }
}

let focusAllowed = false;
/** The prompt shows once per run at most: the first time the planner opens and the phone hasn't asked yet. */
let promptedThisRun = false;

async function syncOnce() {
  await ensureSetup();
  let permission = await refreshPermission();
  if (plannerOpen() && permission === 'undetermined' && !promptedThisRun) {
    promptedThisRun = true;
    permission = await enableNotifications();
  }
  const ready = plannerOpen() && permission === 'granted';
  const wanted = ready ? await remindersApi.upcoming().catch(() => []) : [];
  focusAllowed = ready && (await remindersApi.focusOn().catch(() => false));
  // Signed out, or notifications off: `wanted` is empty, so nothing from this plan stays on the phone.
  await applyReminders(wanted);
  onTimerChange(useTimerStore.getState());
}

let syncTimer = null;
let syncing = null;
let syncAgain = false;

/** Sets the phone's reminders to match the plan now. Calls made while one runs are folded into one more run. */
export function syncReminders() {
  if (!notificationsSupported) return Promise.resolve();
  if (syncing) {
    syncAgain = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        syncAgain = false;
        await syncOnce();
      } while (syncAgain);
    } catch {
      // Reminders are a convenience: a failure never gets in the student's way. The next change tries again.
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Sets reminders again shortly, once a burst of changes has settled. */
export function requestSync() {
  if (!notificationsSupported) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncReminders();
  }, SYNC_DELAY_MS);
}

/* ---------- Focus timer ---------- */

/** What is set for the timer now: { at, mode } or null. */
let focusPlanned = null;

function focusContent({ mode, subject, mins }) {
  const data = { kind: 'timer', open: FOCUS_SCREEN };
  if (mode === 'break') return { title: 'Break’s over', body: 'Ready for the next focus session?', sound: 'default', data };
  return { title: 'Focus session done', body: `${mins} min of ${subjectInfo(subject).name}. Open the app to log it, then take a ${BREAK_MINS}-minute break.`, sound: 'default', data };
}

async function setFocusReminder(want) {
  const same = want && focusPlanned && want.mode === focusPlanned.mode && Math.abs(want.at - focusPlanned.at) < 2000;
  if (same || (!want && !focusPlanned)) return;
  focusPlanned = want;
  try {
    if (!want) {
      await Notifications.cancelScheduledNotificationAsync(FOCUS_ID);
      // The timer is done or stopped in the app, so a "done" notice still showing is out of date.
      await Notifications.dismissNotificationAsync(FOCUS_ID).catch(() => {});
      return;
    }
    if (want.at - Date.now() < 1000) return;
    await Notifications.scheduleNotificationAsync({
      identifier: FOCUS_ID,
      content: focusContent(want),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: want.at, channelId: CHANNEL_OF.timer },
    });
  } catch {
    // The in-app timer still works and logs the session.
  }
}

/** Keeps one notification set for when the running session or break will end. */
function onTimerChange(state) {
  const running = state.running && !state.fastForward && state.owner;
  const allowed = focusAllowed && useNotificationStore.getState().permission === 'granted' && plannerOpen();
  setFocusReminder(
    running && allowed
      ? { at: Math.round(state.lastTick + state.leftSeconds * 1000), mode: state.mode, subject: state.subject, mins: Math.round(state.totalSeconds / 60) }
      : null,
  );
}

/* ---------- Tapping a reminder ---------- */

let navigation = null;
let pendingTap = null;
const handledTaps = new Set();

function onResponse(response) {
  const notification = response?.notification;
  if (!notification) return;
  const key = `${notification.request.identifier}@${notification.date}`;
  if (handledTaps.has(key)) return;
  handledTaps.add(key);
  pendingTap = { data: notification.request.content?.data ?? {}, action: response.actionIdentifier };
  flushNotificationTap();
}

function startFocus(subject) {
  const timer = useTimerStore.getState();
  if (isActive(timer) || timer.mode !== 'focus') return;
  if (subject) timer.setSubject(subject);
  timer.start();
  toast(`Focus timer started${subject ? ` for ${subjectInfo(subject).name}` : ''}.`);
}

async function markHabitDone(data) {
  // A habit can only be ticked for today; an old reminder just opens the routine.
  if (data.date !== localToday().today) return;
  if (await habitActions.setHabitDone(data.habitId, true)) toast('Ticked off. Nice work.');
}

/**
 * Opens what a tapped reminder points to (and does what its button says) once the app is
 * signed in, set up and showing the main tabs. Called again whenever navigation is ready.
 */
export function flushNotificationTap() {
  if (!pendingTap || !navigation?.isReady() || !plannerOpen()) return;
  if (!navigation.getRootState()?.routeNames?.includes('Main')) return;
  const { data, action } = pendingTap;
  pendingTap = null;
  Notifications.clearLastNotificationResponseAsync().catch(() => {});
  if (action === MARK_DONE && data.habitId) markHabitDone(data);
  if (action === START_FOCUS) startFocus(data.subject);
  const open = action === START_FOCUS ? FOCUS_SCREEN : (data.open ?? { screen: 'Today' });
  const params = open.section ? { section: open.section, ...(open.date ? { date: open.date, at: Date.now() } : {}) } : undefined;
  navigation.navigate('Main', { screen: open.screen, params });
}

/* ---------- Start ---------- */

/**
 * Starts reminders for the app. Call once with the navigation container's ref; returns a
 * function that stops listening.
 */
export function startNotifications(navigationRef) {
  if (!notificationsSupported) {
    refreshPermission();
    return () => {};
  }
  navigation = navigationRef;
  const stops = [];
  const responses = Notifications.addNotificationResponseReceivedListener(onResponse);
  stops.push(() => responses.remove());
  // A tap that launched the app arrives before the listener existed.
  Notifications.getLastNotificationResponseAsync()
    .then(onResponse)
    .catch(() => {});
  stops.push(
    useAuthStore.subscribe((state, previous) => {
      if (state.status === previous.status && state.onboarded === previous.onboarded && state.user?.id === previous.user?.id) return;
      requestSync();
      flushNotificationTap();
    }),
  );
  stops.push(
    useResourceStore.subscribe((state, previous) => {
      // Every change invalidates screen data; Today also fills in the coming week when it loads.
      if (state.epoch !== previous.epoch || state.entries.today?.fetchedAt !== previous.entries.today?.fetchedAt) requestSync();
    }),
  );
  stops.push(useTimerStore.subscribe(onTimerChange));
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') requestSync();
  });
  stops.push(() => appState.remove());
  requestSync();
  return () => {
    for (const stop of stops) stop();
    clearTimeout(syncTimer);
    navigation = null;
  };
}
