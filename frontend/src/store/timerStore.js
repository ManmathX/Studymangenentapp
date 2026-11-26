import { create } from 'zustand';
import { habitsApi } from '../data/api';
import { localToday } from '../data/queries';
import { preferences } from '../services/storage/preferences';
import { duration } from '../utils/format';
import { useAuthStore } from './authStore';
import { useResourceStore } from './resourceStore';
import { subjectInfo } from './subjectStore';
import { toast } from './toastStore';

const TICK_MS = 250;
const FAST_FORWARD = 60;
const SAVED_KEY = 'focusTimer';
/** Longest session the planner accepts (see logFocus). */
const MAX_SESSION_SECONDS = 240 * 60;
export const FOCUS_LENGTHS = [15, 25, 45, 60];
export const DEFAULT_FOCUS_MINS = 25;
export const BREAK_MINS = 5;
/** Students whose setup has no Maths start on their first subject (see FocusTimer). */
const DEFAULT_SUBJECT = 'maths';

let interval = null;

const idle = (focusMins) => ({ mode: 'focus', totalSeconds: focusMins * 60, leftSeconds: focusMins * 60, running: false });

/** A session is under way once it has started, whether it is running or paused. */
export const isActive = (state) => state.running || state.leftSeconds < state.totalSeconds;

function stopTicking() {
  clearInterval(interval);
  interval = null;
}

/**
 * Focus timer. It lives outside any screen so it keeps running while the student switches
 * tabs, and it is saved on this phone so a reload or a closed app doesn't lose the session.
 * Each session belongs to the signed-in account; finished focus sessions are logged to the
 * chosen subject, breaks are never logged.
 */
export const useTimerStore = create((set, get) => {
  const startTicking = () => {
    stopTicking();
    interval = setInterval(() => get().tick(), TICK_MS);
  };

  /** Saves the timer for this account. Called on every change of state, not on every tick. */
  const persist = () => {
    const { owner, mode, subject, focusMins, totalSeconds, leftSeconds, running } = get();
    if (!owner) return;
    const record = { owner, day: localToday().today, mode, subject, focusMins, totalSeconds, leftSeconds: Math.max(0, Math.round(leftSeconds)), running, savedAt: Date.now() };
    preferences.set(SAVED_KEY, JSON.stringify(record));
  };

  const endBreak = (announce) => {
    stopTicking();
    set(idle(get().focusMins));
    persist();
    if (announce) toast('Break over. Ready for the next session.');
  };

  return {
    owner: null,
    subject: DEFAULT_SUBJECT,
    focusMins: DEFAULT_FOCUS_MINS,
    ...idle(DEFAULT_FOCUS_MINS),
    /** True while a finished session is being logged; blocks a second finish. */
    saving: false,
    /** The last logged session, for the completion card: { subject, mins, completed }. */
    result: null,
    fastForward: false,
    lastTick: 0,

    setSubject(subject) {
      if (get().running || get().mode !== 'focus') return;
      set({ subject });
      persist();
    },

    setLength(minutes) {
      if (!FOCUS_LENGTHS.includes(minutes) || get().mode !== 'focus' || isActive(get())) return;
      set({ focusMins: minutes, ...idle(minutes) });
      persist();
    },

    /** Development aid only: release builds always run in real time. */
    setFastForward(fastForward) {
      set({ fastForward: __DEV__ && fastForward });
    },

    start() {
      if (get().running || get().saving) return;
      set({ running: true, lastTick: Date.now(), result: null });
      startTicking();
      persist();
    },

    pause() {
      if (!get().running) return;
      get().tick();
      if (!get().running) return; // the last tick finished the session
      stopTicking();
      set({ running: false });
      persist();
    },

    toggle() {
      if (get().running) get().pause();
      else get().start();
    },

    tick() {
      const { running, lastTick, leftSeconds, fastForward } = get();
      if (!running) return undefined;
      const now = Date.now();
      const left = leftSeconds - ((now - lastTick) / 1000) * (fastForward ? FAST_FORWARD : 1);
      if (left <= 0) {
        set({ leftSeconds: 0, lastTick: now });
        return get().complete();
      }
      set({ leftSeconds: left, lastTick: now });
      return undefined;
    },

    /** The countdown reached zero. */
    complete() {
      if (get().mode === 'break') return endBreak(true);
      return get().finish(true);
    },

    /** Ends the focus session and logs the minutes done so far (or the whole session when it completes). */
    async finish(completed = false) {
      const state = get();
      if (state.saving || !isActive(state)) return;
      if (state.mode === 'break') {
        endBreak(false);
        return;
      }
      stopTicking();
      const { totalSeconds, leftSeconds, subject, focusMins } = state;
      const minutes = Math.round((completed ? totalSeconds : totalSeconds - leftSeconds) / 60);
      set({ ...idle(focusMins), saving: minutes >= 1, result: null });
      persist();
      if (minutes < 1) {
        toast('Under a minute, so nothing was logged.');
        return;
      }
      try {
        await habitsApi.logFocus(subject, minutes);
        const name = subjectInfo(subject).name;
        set({ result: { subject, mins: minutes, completed } });
        toast(completed ? `Session complete. ${duration(minutes)} of ${name} logged.` : `${duration(minutes)} of ${name} logged.`);
        useResourceStore.getState().invalidate(['habits', 'today', 'progress']);
      } catch (error) {
        toast(error.message || 'Couldn’t log this session.', 'error');
      } finally {
        set({ saving: false });
      }
    },

    /** Ends the session without logging anything. */
    discard() {
      stopTicking();
      set({ ...idle(get().focusMins), result: null });
      persist();
    },

    startBreak() {
      if (get().saving || (get().mode === 'focus' && isActive(get()))) return;
      set({ mode: 'break', totalSeconds: BREAK_MINS * 60, leftSeconds: BREAK_MINS * 60, running: true, lastTick: Date.now(), result: null });
      startTicking();
      persist();
    },

    skipBreak() {
      if (get().mode === 'break') endBreak(false);
    },

    dismissResult() {
      set({ result: null });
    },

    /**
     * Ties the timer to the signed-in account (null when signed out) and restores that account's
     * session from this phone. A session that ran out while the app was closed is logged then;
     * one left over from an earlier day is dropped, because sessions are logged to today.
     */
    async bindOwner(owner) {
      stopTicking();
      // Nothing carries over from the previous account; this one's own choices are restored below.
      set({ owner, subject: DEFAULT_SUBJECT, focusMins: DEFAULT_FOCUS_MINS, ...idle(DEFAULT_FOCUS_MINS), saving: false, result: null, lastTick: 0 });
      if (!owner) return;
      let saved = null;
      try {
        saved = JSON.parse((await preferences.get(SAVED_KEY)) || 'null');
      } catch {
        saved = null;
      }
      // Skip if the account changed meanwhile, or the student already started something new.
      if (get().owner !== owner || isActive(get()) || !saved || saved.owner !== owner) return;

      const focusMins = FOCUS_LENGTHS.includes(saved.focusMins) ? saved.focusMins : DEFAULT_FOCUS_MINS;
      set({ focusMins, ...idle(focusMins), ...(typeof saved.subject === 'string' ? { subject: saved.subject } : {}) });

      const total = Number(saved.totalSeconds);
      const left = Number(saved.leftSeconds);
      const valid = total > 0 && total <= MAX_SESSION_SECONDS && left >= 0 && left <= total;
      if (!valid || !(saved.running || left < total)) return;
      if (saved.day !== localToday().today) {
        persist();
        if (saved.mode !== 'break' && total - left >= 60) toast('An unfinished focus session from an earlier day wasn’t logged.');
        return;
      }

      const away = saved.running ? Math.max(0, (Date.now() - Number(saved.savedAt || Date.now())) / 1000) : 0;
      const mode = saved.mode === 'break' ? 'break' : 'focus';
      set({ mode, totalSeconds: total, leftSeconds: Math.max(0, left - away), running: Boolean(saved.running), lastTick: Date.now() });
      if (!saved.running) return;
      if (left - away <= 0) {
        if (mode === 'break') endBreak(false);
        else await get().finish(true);
        return;
      }
      startTicking();
    },
  };
});

// Follow the signed-in account: stop on sign-out and restore that account's session on sign-in.
useAuthStore.subscribe((state, previous) => {
  const owner = state.user?.id ?? null;
  if (owner !== (previous.user?.id ?? null)) {
    useTimerStore.getState().bindOwner(owner);
  } else if (previous.onboarded && !state.onboarded) {
    // "Start over" removed the plan this session would be logged to.
    useTimerStore.getState().discard();
  }
});
const signedIn = useAuthStore.getState().user?.id;
if (signedIn) useTimerStore.getState().bindOwner(signedIn);
