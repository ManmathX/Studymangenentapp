import mongoose, { type ClientSession } from 'mongoose';

/** Runs work inside a MongoDB transaction, retrying transient errors as the driver advises. */
export async function withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

/** Opaque handle passed through repositories so their writes join one transaction. */
export type TxHandle = ClientSession;

export interface TransactionRunner {
  run<T>(work: (tx: TxHandle) => Promise<T>): Promise<T>;
}

export const mongoTransactionRunner: TransactionRunner = { run: withTransaction };
