import * as SecureStore from 'expo-secure-store';
import { profileApi } from '../../data/api';
import { read } from '../../data/db';
import { advanceDays, freshPlanner, ONBOARDING, OWNER } from '../../data/__tests__/helpers';
import { useTimerStore } from '../timerStore';
import { useToastStore } from '../toastStore';

const timer = () => useTimerStore.getState();
const sessions = () => read().focusSessions;
const minutes = (count) => count * 60 * 1000;
/** Lets the planner write and the store's follow-up updates run. */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

beforeEach(async () => {
  SecureStore.__reset();
  await freshPlanner();
  await profileApi.onboard(ONBOARDING);
  jest.useFakeTimers({ now: new Date('2026-11-18T06:00:00.000Z') });
  await timer().bindOwner(OWNER);
});

afterEach(() => {
  timer().discard();
  jest.useRealTimers();
});

describe('focus timer', () => {
  it('logs a full session once when the countdown ends, then offers a break', async () => {
    timer().setSubject('science');
    timer().setLength(15);
    timer().start();
    jest.advanceTimersByTime(minutes(15) + 1000);
    await settle();
    expect(sessions()).toEqual([expect.objectContaining({ subject: 'science', mins: 15 })]);
    expect(timer()).toMatchObject({ running: false, mode: 'focus', leftSeconds: 900, result: { subject: 'science', mins: 15, completed: true } });
  });

  it('finishes early with the minutes so far, and only once', async () => {
    timer().start();
    jest.advanceTimersByTime(minutes(10));
    await Promise.all([timer().finish(false), timer().finish(false)]);
    expect(sessions()).toEqual([expect.objectContaining({ subject: 'maths', mins: 10 })]);
    expect(timer().result).toEqual({ subject: 'maths', mins: 10, completed: false });
  });

  it('pauses the countdown and discards without logging', async () => {
    timer().start();
    jest.advanceTimersByTime(minutes(2));
    timer().pause();
    jest.advanceTimersByTime(minutes(10));
    expect(timer().leftSeconds).toBeCloseTo(25 * 60 - 120, 0);
    expect(timer().running).toBe(false);
    timer().discard();
    await settle();
    expect(sessions()).toEqual([]);
    expect(timer()).toMatchObject({ running: false, leftSeconds: 25 * 60, result: null });
  });

  it('ignores length changes once a session has started', () => {
    timer().start();
    jest.advanceTimersByTime(1000);
    timer().pause();
    timer().setLength(45);
    expect(timer().totalSeconds).toBe(25 * 60);
  });

  it('never logs a break', async () => {
    timer().setLength(15);
    timer().start();
    jest.advanceTimersByTime(minutes(15) + 1000);
    await settle();
    timer().startBreak();
    expect(timer()).toMatchObject({ mode: 'break', running: true, totalSeconds: 300 });
    jest.advanceTimersByTime(minutes(5) + 1000);
    await settle();
    expect(timer()).toMatchObject({ mode: 'focus', running: false, totalSeconds: 900 });
    expect(useToastStore.getState().message).toBe('Break over. Ready for the next session.');
    expect(sessions()).toHaveLength(1);
  });

  it('carries on after the app restarts', async () => {
    timer().start();
    jest.advanceTimersByTime(minutes(5));
    // The app is closed (nothing in memory) and opened again 5 minutes later.
    await timer().bindOwner(null);
    jest.advanceTimersByTime(minutes(5));
    await timer().bindOwner(OWNER);
    expect(timer().running).toBe(true);
    expect(timer().leftSeconds).toBeCloseTo(15 * 60, -1);
    jest.advanceTimersByTime(minutes(15) + 1000);
    await settle();
    expect(sessions()).toEqual([expect.objectContaining({ mins: 25 })]);
  });

  it('logs a session that ran out while the app was closed', async () => {
    timer().setLength(15);
    timer().start();
    await timer().bindOwner(null);
    jest.advanceTimersByTime(minutes(40));
    await timer().bindOwner(OWNER);
    await settle();
    expect(sessions()).toEqual([expect.objectContaining({ mins: 15 })]);
    expect(timer().running).toBe(false);
  });

  it('keeps a paused session paused across a restart', async () => {
    timer().start();
    jest.advanceTimersByTime(minutes(3));
    timer().pause();
    await timer().bindOwner(null);
    jest.advanceTimersByTime(minutes(30));
    await timer().bindOwner(OWNER);
    expect(timer().running).toBe(false);
    expect(timer().leftSeconds).toBeCloseTo(22 * 60, -1);
  });

  it('does not restore another account’s session or one from an earlier day', async () => {
    timer().start();
    jest.advanceTimersByTime(minutes(5));
    await timer().bindOwner('someone-else');
    expect(timer()).toMatchObject({ running: false, leftSeconds: 25 * 60 });

    advanceDays(1);
    await timer().bindOwner(OWNER);
    expect(timer()).toMatchObject({ running: false, leftSeconds: 25 * 60 });
    await settle();
    expect(sessions()).toEqual([]);
  });
});
