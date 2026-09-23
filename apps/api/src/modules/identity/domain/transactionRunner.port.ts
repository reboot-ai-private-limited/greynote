/**
 * Opaque on purpose — only `infrastructure/mongooseTransactionRunner.adapter.ts` and the
 * repository adapters that accept it know it's actually a Mongoose `ClientSession`. Keeping the
 * type opaque here is what lets `domain/` depend on this port without importing `mongoose`
 * (`domain/` never imports Mongoose — 2026-09-19 decision).
 */
export type TransactionContext = unknown;

/**
 * This codebase's first transactional write path — needed only where a single use case must
 * commit writes to two collections together (`unblockUser`: closing a `ComplianceBlock` and
 * flipping `User.isBlocked` must both happen or neither does). Every other write in this system
 * is a single document update, which MongoDB already makes atomic on its own — don't reach for
 * this port unless a use case genuinely spans more than one collection.
 */
export interface TransactionRunnerPort {
  run<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
