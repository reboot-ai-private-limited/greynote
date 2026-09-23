import mongoose from 'mongoose';
import type { TransactionContext, TransactionRunnerPort } from '../domain/transactionRunner.port.js';

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
