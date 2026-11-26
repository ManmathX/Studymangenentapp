/**
 * Removes students' planner data left in the database from before plans moved onto phones:
 * `npm run drop-planner-data` lists what is there, `npm run drop-planner-data -- --yes` deletes it.
 * Reads MONGODB_URI from the environment or .env. Logins, sessions, the audit log and the
 * syllabus catalogue are never touched.
 *
 * This cannot be undone, and the app does not copy old server data to phones: take a database
 * backup first if any of it might still be wanted.
 */
import mongoose from 'mongoose';
import { loadConfig, loadDotEnvIfPresent } from '../src/config/env.js';
import { createLogger } from '../src/config/logger.js';
import { connectMongo, disconnectMongo } from '../src/database/mongoose.js';

/** Collections of the planner modules the server no longer has. */
const PLANNER_COLLECTIONS = [
  'profiles',
  'chapters',
  'exams',
  'tasks',
  'suggestions',
  'homeworks',
  'dailylogs',
  'focussessions',
];

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadConfig();
  const logger = createLogger({ ...config, NODE_ENV: 'production' });
  const confirmed = process.argv.includes('--yes');

  await connectMongo({ uri: config.MONGODB_URI, maxPoolSize: 2, autoIndex: false }, logger);
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Not connected to MongoDB');
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
    );
    const found = PLANNER_COLLECTIONS.filter((name) => existing.has(name));
    if (!found.length) {
      console.log('No planner data found. The database only holds logins and the syllabus.');
      return;
    }
    for (const name of found) {
      console.log(`${name}: ${await db.collection(name).countDocuments()} documents`);
    }
    if (!confirmed) {
      console.log('\nNothing was deleted. Run again with --yes to delete these collections.');
      return;
    }
    for (const name of found) await db.dropCollection(name);
    console.log(`\nDeleted ${found.length} collection(s).`);
  } finally {
    await disconnectMongo();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
