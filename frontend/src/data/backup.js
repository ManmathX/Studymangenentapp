import { clock } from './clock';
import { migrate, read, replaceAll } from './db';
import { badRequest } from './errors';

const APP = 'study-planner';
const FORMAT = 1;

/** Everything on this device as one JSON text, for saving a backup or moving to a new phone. */
export function exportBackup() {
  return JSON.stringify({ app: APP, format: FORMAT, exportedAt: clock.now().toISOString(), data: read() });
}

/** Checks a backup without changing anything. Throws a friendly error if it can't be used. */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest('That file is not a Study Planner backup.', 'BACKUP_INVALID');
  }
  if (parsed?.app !== APP || !parsed.data) throw badRequest('That file is not a Study Planner backup.', 'BACKUP_INVALID');
  try {
    const data = migrate(parsed.data);
    return {
      data,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
      name: data.profile?.name ?? null,
      tasks: data.tasks.length,
    };
  } catch (error) {
    throw badRequest(`This backup can’t be opened: ${error.message}.`, 'BACKUP_INVALID');
  }
}

/** Replaces everything on this device with the backup. */
export function restoreBackup(text) {
  const { data } = parseBackup(text);
  replaceAll(data);
  return { onboarded: Boolean(data.profile), name: data.profile?.name ?? null };
}
