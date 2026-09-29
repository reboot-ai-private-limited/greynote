/**
 * A write hit a unique constraint. Thrown (not returned) from inside a transaction, because the
 * database aborts the whole transaction on any write error — swallowing it and carrying on would
 * only fail later, at commit. The use case catches it *outside* the transaction and decides.
 */
export class DuplicateRecordError extends Error {
  constructor(what: string) {
    super(`Duplicate ${what}`);
    this.name = 'DuplicateRecordError';
  }
}
