import type { TestProject } from 'vitest/node';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * Starts one single-node replica set for the whole run (transactions need a replica set).
 * Set TEST_MONGODB_URI to use an existing replica set instead, e.g. a CI service container.
 * Set MONGOMS_SYSTEM_BINARY to reuse a locally installed mongod instead of downloading one.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const external = process.env.TEST_MONGODB_URI;
  if (external) {
    project.provide('mongoUri', external);
    return async () => {};
  }
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}
