import { create } from 'zustand';
import { habitsApi } from '../services/api/endpoints';
import { duration } from '../utils/format';
import { subjects } from '../theme/tokens';
import { toast } from './toastStore';
import { useResourceStore } from './resourceStore';

const TICK_MS = 250;
const FAST_FORWARD = 60;
let interval = null;

/**
 * Focus timer. It lives outside any screen so it keeps running while the student
 * switches tabs. Finished or logged sessions are saved to the chosen subject.
 */
export const useTimerStore = create((set, get) => ({
  subject: 'maths',
  totalSeconds: 25 * 60,
  leftSeconds: 25 * 60,
  running: false,
  fastForward: false,
  lastTick: 0,

  setSubject(subject) {
    if (!get().running) set({ subject });
  },

  setLength(minutes) {
    const { running, leftSeconds, totalSeconds } = get();
    if (running || leftSeconds < totalSeconds) return;
    set({ totalSeconds: minutes * 60, leftSeconds: minutes * 60 });
  },

  /** Development aid only: release builds always run in real time. */
  setFastForward(fastForward) {
    set({ fastForward: __DEV__ && fastForward });
  },

  toggle() {
    if (get().running) {
      clearInterval(interval);
      set({ running: false });
      return;
    }
    set({ running: true, lastTick: Date.now() });
    clearInterval(interval);
    interval = setInterval(() => get().tick(), TICK_MS);
  },

  tick() {
    const { running, lastTick, leftSeconds, fastForward } = get();
    if (!running) return;
    const now = Date.now();
    const left = leftSeconds - ((now - lastTick) / 1000) * (fastForward ? FAST_FORWARD : 1);
    if (left <= 0) {
      get().finish(true);
      return;
    }
    set({ leftSeconds: left, lastTick: now });
  },

  /** Logs the minutes done so far (or the whole session when it completes). */
  async finish(completed = false) {
    clearInterval(interval);
    const { totalSeconds, leftSeconds, subject } = get();
    const minutes = Math.round((completed ? totalSeconds : totalSeconds - leftSeconds) / 60);
    set({ running: false, leftSeconds: totalSeconds });
    if (minutes < 1) {
      toast('Under a minute, so nothing was logged.');
      return;
    }
    try {
      await habitsApi.logFocus(subject, minutes);
      toast(completed ? `Session done. ${duration(minutes)} of ${subjects[subject].name} logged. Take a 5 min break.` : `${duration(minutes)} of ${subjects[subject].name} logged.`);
      useResourceStore.getState().invalidate(['habits', 'today', 'progress']);
    } catch (error) {
      toast(error.message, 'error');
    }
  },
}));
