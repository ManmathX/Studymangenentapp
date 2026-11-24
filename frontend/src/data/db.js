import { storage } from './storage';

/**
 * The student's whole planner lives in one JSON document, kept in memory and saved to the
 * device shortly after every change. Each change runs on a copy and is only kept if it
 * finishes without an error, so a failed action never leaves half-applied data.
 */
export const SCHEMA_VERSION = 1;
const FILE = 'planner';
const SAVE_DELAY_MS = 250;

export function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    seq: 0,
    profile: null,
    chapters: [],
    exams: [],
    homework: [],
    tasks: [],
    suggestions: [],
    focusSessions: [],
    dailyLogs: {},
  };
}

const COLLECTIONS = ['chapters', 'exams', 'homework', 'tasks', 'suggestions', 'focusSessions'];

/** Checks the shape of saved or imported data and upgrades older versions. Throws if unusable. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a planner document');
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || version < 1) throw new Error('Unknown planner format');
  if (version > SCHEMA_VERSION) throw new Error('This data comes from a newer version of the app');
  for (const name of COLLECTIONS) if (!Array.isArray(raw[name])) throw new Error(`Missing ${name}`);
  if (!raw.dailyLogs || typeof raw.dailyLogs !== 'object') throw new Error('Missing dailyLogs');
  if (raw.profile !== null && typeof raw.profile !== 'object') throw new Error('Bad profile');
  return { ...emptyData(), ...raw, schemaVersion: SCHEMA_VERSION, seq: Number(raw.seq) || 0 };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

let state = null;
let dirty = false;
let saveTimer = null;
let saving = Promise.resolve();
let onSaveError = () => {};

/** Called once at start-up. Returns `{ recovered }` when an unreadable file had to be set aside. */
export async function loadData() {
  dirty = false;
  const text = await storage.read(FILE);
  if (!text) {
    state = emptyData();
    return { recovered: false };
  }
  try {
    state = migrate(JSON.parse(text));
    return { recovered: false };
  } catch {
    // Keep the unreadable copy so nothing is destroyed, then start fresh.
    await storage.write(`${FILE}-unreadable-${Date.now()}`, text);
    state = emptyData();
    dirty = true;
    await persistNow();
    return { recovered: true };
  }
}

function current() {
  if (!state) throw new Error('Planner data used before loadData()');
  return state;
}

/** Read-only view of the data. Never mutate what this returns. */
export function read() {
  return current();
}

/** Applies a change atomically: `change` edits a draft copy that replaces the data only if it returns normally. */
export function write(change) {
  const draft = clone(current());
  const result = change(draft);
  state = draft;
  scheduleSave();
  return result;
}

/** Replaces everything (import a backup, start over). */
export function replaceAll(next) {
  state = migrate(clone(next));
  scheduleSave();
}

/** Next number in a sequence that survives restarts (keeps tasks in the order they were added). */
export function nextSeq(draft) {
  draft.seq += 1;
  return draft.seq;
}

function scheduleSave() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistNow().catch(() => {});
  }, SAVE_DELAY_MS);
}

/** Writes pending changes now. Call when the app goes to the background. */
export function persistNow() {
  clearTimeout(saveTimer);
  if (!dirty && state) return saving;
  dirty = false;
  const text = JSON.stringify(state);
  // Chain after the previous save even if it failed, so one error never blocks later saves.
  saving = saving
    .catch(() => {})
    .then(() => storage.write(FILE, text))
    .catch((error) => {
      dirty = true;
      onSaveError(error);
      throw error;
    });
  return saving;
}

export function setSaveErrorHandler(handler) {
  onSaveError = handler;
}

/** Test helper: forget the in-memory copy. */
export function resetForTests() {
  clearTimeout(saveTimer);
  state = null;
  dirty = false;
  saving = Promise.resolve();
}
