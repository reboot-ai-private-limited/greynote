import mongoose from 'mongoose';
import type { TransactionContext, TransactionRunnerPort } from './transaction.port.js';

/**
 * `withTransaction` retries the whole callback on a transient error, so everything inside `fn`
 * must be safe to run twice — true of database writes on `ctx` (the failed attempt's writes are
 * rolled back), not of external side effects like sending a notification.
 */
export class MongooseTransactionRunner implements TransactionRunnerPort {
  async run<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    const session = await mongoose.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}
