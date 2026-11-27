import * as Notifications from 'expo-notifications';
import { dashboardApi, habitsApi, profileApi, remindersApi } from '../../data/api';
import { read } from '../../data/db';
import { freshPlanner, ONBOARDING, OWNER, TODAY } from '../../data/__tests__/helpers';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useTimerStore } from '../../store/timerStore';
import { useToastStore } from '../../store/toastStore';
import { startNotifications, syncReminders } from '../notifications';

const TOMORROW = '2026-11-19';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const scheduledIds = () => [...Notifications.__scheduled.keys()].sort();
const planIds = () => scheduledIds().filter((id) => id.startsWith('plan:'));

/** A navigation container that is ready and showing the main tabs. */
function fakeNavigation() {
  return { isReady: () => true, getRootState: () => ({ routeNames: ['Main', 'Profile'] }), navigate: jest.fn() };
}

function tap({ identifier = 'plan:test', data, action = Notifications.DEFAULT_ACTION_IDENTIFIER, date = Date.now() }) {
  Notifications.__respond({ actionIdentifier: action, notification: { date, request: { identifier, content: { title: '', body: '', data } } } });
}

let navigation;
let stop;

beforeEach(async () => {
  Notifications.__reset();
  jest.clearAllMocks();
  await freshPlanner();
  await profileApi.onboard(ONBOARDING);
  await dashboardApi.today();
  useAuthStore.setState({ status: 'signedIn', user: { id: OWNER, name: 'Asha' }, onboarded: true });
  navigation = fakeNavigation();
  stop = startNotifications(navigation);
  await settle();
});

afterEach(() => {
  useTimerStore.getState().discard();
  useToastStore.getState().hide();
  // Also drops any sync still waiting to run.
  stop();
});

describe('setting reminders on the phone', () => {
  it('sets one local notification per reminder, at its time, on its Android channel', async () => {
    await syncReminders();
    const wanted = await remindersApi.upcoming();
    expect(planIds()).toEqual(wanted.map((item) => item.id).sort());
    const night = wanted.find((item) => item.id.startsWith(`plan:slots:${TODAY}:night`));
    const request = Notifications.__scheduled.get(night.id);
    expect(request.trigger).toMatchObject({ type: 'date', date: night.at, channelId: 'study' });
    expect(request.content).toMatchObject({ title: night.title, body: night.body, data: { kind: 'slots', open: { screen: 'Today' } } });
  });

  it('only touches reminders that changed', async () => {
    await syncReminders();
    Notifications.scheduleNotificationAsync.mockClear();
    await syncReminders();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    // A focus session today: tonight's streak nudge goes, nothing else is set again.
    await habitsApi.logFocus('maths', 20);
    await syncReminders();
    expect(planIds()).not.toContain(`plan:streak:${TODAY}:streak`);
    expect(planIds()).toContain(`plan:streak:${TOMORROW}:streak`);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('asks once when the phone hasn’t asked yet, and sets nothing when notifications are off', async () => {
    Notifications.__setPermission({ granted: false, status: 'undetermined', canAskAgain: true });
    await syncReminders();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(planIds().length).toBeGreaterThan(0);

    Notifications.__setPermission({ granted: false, status: 'denied', canAskAgain: false });
    await syncReminders();
    expect(planIds()).toEqual([]);
    expect(useNotificationStore.getState()).toMatchObject({ permission: 'denied', canAskAgain: false });
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('clears this plan’s reminders when the student signs out or turns them all off', async () => {
    await syncReminders();
    await profileApi.update({ reminders: { slots: false, tests: false, focus: false, bag: false, streak: false } });
    await syncReminders();
    expect(planIds()).toEqual([]);

    await profileApi.update({ reminders: { slots: true } });
    await syncReminders();
    expect(planIds().length).toBeGreaterThan(0);
    useAuthStore.setState({ status: 'signedOut', user: null, onboarded: false });
    await syncReminders();
    expect(planIds()).toEqual([]);
  });
});

describe('focus timer', () => {
  it('sets a notification for the end of a running session and drops it when paused', async () => {
    await syncReminders();
    const timer = useTimerStore.getState();
    timer.setSubject('science');
    timer.start();
    await settle();
    const request = Notifications.__scheduled.get('focus:timer');
    expect(request.content).toMatchObject({ title: 'Focus session done', data: { kind: 'timer' } });
    expect(request.content.body).toContain('Science');
    expect(Math.abs(request.trigger.date - (Date.now() + 25 * 60 * 1000))).toBeLessThan(2000);

    useTimerStore.getState().pause();
    await settle();
    expect(Notifications.__scheduled.has('focus:timer')).toBe(false);
  });
});

describe('tapping a reminder', () => {
  it('opens the screen it points to', async () => {
    const date = Date.now();
    tap({ data: { open: { screen: 'Plan', section: 'plan', date: TOMORROW } }, date });
    expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Plan', params: { section: 'plan', date: TOMORROW, at: expect.any(Number) } });
    // The same tap delivered twice (by the listener and again at launch) opens the screen once.
    tap({ data: { open: { screen: 'Plan', section: 'plan', date: TOMORROW } }, date });
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
  });

  it('ticks a habit from the Mark done button', async () => {
    const habit = await habitsApi.addHabit({ name: 'Swimming', part: 'evening', days: [0, 1, 2, 3, 4, 5, 6], at: '19:00', mins: 45 });
    tap({ action: 'markDone', data: { habitId: habit.id, date: TODAY, open: { screen: 'Habits', section: 'habits' } } });
    await settle();
    expect(read().dailyLogs[TODAY].ticks[habit.id]).toBe(true);
  });

  it('starts the focus timer for the slot’s subject from the Start focus button', async () => {
    tap({ action: 'startFocus', data: { subject: 'science', open: { screen: 'Today' } } });
    expect(useTimerStore.getState()).toMatchObject({ running: true, subject: 'science', mode: 'focus' });
    expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Habits', params: { section: 'habits' } });
  });

  it('waits until the app is signed in before opening anything', async () => {
    useAuthStore.setState({ status: 'booting', onboarded: false });
    tap({ identifier: 'plan:later', data: { open: { screen: 'Today' } } });
    expect(navigation.navigate).not.toHaveBeenCalled();
    useAuthStore.setState({ status: 'signedIn', onboarded: true });
    expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Today', params: undefined });
  });
});
