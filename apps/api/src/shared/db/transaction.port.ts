/**
 * Opaque on purpose — only `mongooseTransactionRunner.ts` and the repository adapters that accept
 * it know it's actually a Mongoose `ClientSession`. Keeping the type opaque is what lets any
 * module's `domain/` depend on this port without importing `mongoose` (2026-09-19 decision).
 *
 * In `shared/` because a transaction can span modules: the approval module runs an owning
 * module's decision callback inside its own transaction, passing this context across.
 */
export type TransactionContext = unknown;

/**
 * Only for a use case that must commit writes to more than one collection together (e.g.
 * `unblockUser`: closing a `ComplianceBlock` and flipping `User.isBlocked`; an approval decision
 * and the owning module's reaction to it). A single-document update is already atomic in
 * MongoDB — don't reach for this port unless a use case genuinely spans collections.
 */
export interface TransactionRunnerPort {
  run<T>(fn: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
