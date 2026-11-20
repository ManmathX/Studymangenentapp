import mongoose from 'mongoose';
import type { Logger } from 'pino';

mongoose.set('strictQuery', true);

export interface MongoOptions {
  uri: string;
  maxPoolSize: number;
  autoIndex: boolean;
}

export async function connectMongo(options: MongoOptions, logger: Logger): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (error: Error) => logger.error({ err: error }, 'MongoDB error'));

  const connection = await mongoose.connect(options.uri, {
    maxPoolSize: options.maxPoolSize,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 30_000,
    autoIndex: options.autoIndex,
  });
  await mongoose.connection.syncIndexes();
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return connection;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export async function pingMongo(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !db) return false;
  const result = await db.admin().ping();
  return result.ok === 1;
}
