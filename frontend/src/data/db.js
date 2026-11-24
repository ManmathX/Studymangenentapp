import { storage } from './storage';

/**
 * The student's whole planner lives in one JSON document on this device, never on the
 * server. Each signed-in account has its own file, so two students sharing a phone never
 * see each other's plan. The open document is kept in memory and saved shortly after every
 * change. Each change runs on a copy and is only kept if it finishes without an error, so a
 * failed action never leaves half-applied data.
 */
export const SCHEMA_VERSION = 1;
const SAVE_DELAY_MS = 250;

/** File name for one account's planner. Account ids are server ids, so keep them file-safe. */
function fileFor(owner) {
  const safe = String(owner ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!safe) throw new Error('Planner data needs a signed-in account');
  return `planner-${safe}`;
}

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
/** File of the open account's planner; null while no one is signed in. */
let file = null;
let dirty = false;
let saveTimer = null;
let saving = Promise.resolve();
let onSaveError = () => {};

/**
 * Opens the planner of the account `owner` (its server id), saving and closing any other
 * one first. Returns `{ recovered }` when an unreadable file had to be set aside.
 */
export async function loadData(owner) {
  const next = fileFor(owner);
  await unloadData();
  file = next;
  const text = await storage.read(file);
  if (!text) {
    state = emptyData();
    return { recovered: false };
  }
  try {
    state = migrate(JSON.parse(text));
    return { recovered: false };
  } catch {
    // Keep the unreadable copy so nothing is destroyed, then start fresh.
    await storage.write(`${file}-unreadable-${Date.now()}`, text);
    state = emptyData();
    dirty = true;
    await persistNow();
    return { recovered: true };
  }
}

/** Saves anything pending and closes the open planner (signing out). The file stays on the device. */
export async function unloadData() {
  if (state) await persistNow().catch(() => {});
  clearTimeout(saveTimer);
  state = null;
  file = null;
  dirty = false;
}

/** Deletes an account's planner from this device (the account itself was deleted). */
export async function deleteData(owner) {
  const target = fileFor(owner);
  if (file === target) {
    clearTimeout(saveTimer);
    state = null;
    file = null;
    dirty = false;
  }
  // Let a save already under way finish first, so it can't re-create the file afterwards.
  await saving.catch(() => {});
  await storage.remove(target);
}

/** True once a signed-in account's planner is open. */
export function isLoaded() {
  return state !== null;
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
  current();
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
  if (!dirty || !state || !file) return saving;
  dirty = false;
  // Capture both now: by the time the write runs, another account may have been opened.
  const target = file;
  const text = JSON.stringify(state);
  // Chain after the previous save even if it failed, so one error never blocks later saves.
  saving = saving
    .catch(() => {})
    .then(() => storage.write(target, text))
    .catch((error) => {
      if (file === target) dirty = true;
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
  file = null;
  dirty = false;
  saving = Promise.resolve();
}
