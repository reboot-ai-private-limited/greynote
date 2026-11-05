import type { StockStatus } from './monthlyStock.entity.js';

/** One distributor's product in a manager's month: the frozen sum, in units, of the approved MR rows below them. Valued at PTS when read. */
export interface SecondaryRollupLine {
  distributorId: string;
  productId: string;
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
}

/**
 * One MR's submitted secondary report that the snapshot was built from: a reference to that report's approval request (not to the MR as a user), with
 * where it stood and the MR's totals then. Only an `APPROVED` source feeds `lines`; the others are listed so "6 of 8 approved" is on the record.
 */
export interface SecondaryRollupSource {
  /** The MR's report record id, `mrUserId:month`. */
  recordId: string;
  /** `null` when the MR had not submitted. */
  requestId: string | null;
  cycle: number;
  /** The approval request's status then, or `NOT_SUBMITTED`. */
  status: string;
  decidedAt: Date | null;
  /** Display only: the MR's user id, name and code as they were. */
  mrUserId: string;
  name: string;
  employeeCode: string;
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
}

/** The manager's designation when they submitted (for example RSM), kept so the record never depends on today's hierarchy. */
export interface RollupDesignation {
  name: string | null;
  level: number | null;
}

/**
 * A manager's month of secondary sales, submitted and approved (decision-log 2026-11-05): the sum of the approved MR reports below them, saved as a
 * document once approved. It is the manager's personal achievement. It is built from MR rows directly, never from a junior manager's snapshot, so nothing
 * is counted twice; company totals keep using MR rows only.
 */
export interface SecondaryRollup {
  id: string;
  userId: string;
  month: string;
  status: StockStatus;
  requestId: string | null;
  designation: RollupDesignation;
  lines: SecondaryRollupLine[];
  sources: SecondaryRollupSource[];
  submittedAt: Date;
  approvedAt: Date | null;
}

export type SecondaryRollupInput = Omit<SecondaryRollup, 'id'>;
