import { logger } from '@/shared/logging/logger.js';

/**
 * Things that happened which someone should hear about. A module announces them after its work has committed; the composition root
 * (`pushEvents.ts`) decides who is told. This is how a lower-tier module (Approval, Identity) causes a message without importing the
 * Inbox above it. In-process and fire-and-forget: a listener that fails is logged and never fails the announcer.
 */
export interface AppEvents {
  /** A request reached a final answer: approved by the last approver, rejected, or closed automatically. */
  'approval.decided': {
    kind: string;
    recordId: string;
    submitterId: string;
    status: 'APPROVED' | 'REJECTED';
    comment: string | null;
    actorId: string;
    auto: boolean;
  };
  /** An exception that lets the employee submit after the deadline was given. */
  'submit.exception.granted': {
    userId: string;
    /** `DAILY_PLAN` (planKey is the date), `MONTHLY_PLAN` (the month) or `EXPENSE_MONTH` (the month). */
    kind: 'DAILY_PLAN' | 'MONTHLY_PLAN' | 'EXPENSE_MONTH';
    planKey: string;
    expiresAt: Date;
    grantedBy: string;
  };
  /** A manager or Admin changed an employee's Monthly Plan while it waited for approval. */
  'monthly.plan.amended': { userId: string; planId: string; planMonth: string; by: string; byName: string; reason: string };
  /** A compliance block was cleared. */
  'user.unblocked': { userId: string; by: string };
}

type Listener<K extends keyof AppEvents> = (event: AppEvents[K]) => void | Promise<void>;

const listeners = new Map<keyof AppEvents, Array<Listener<keyof AppEvents>>>();

export const appEvents = {
  on<K extends keyof AppEvents>(name: K, listener: Listener<K>): void {
    listeners.set(name, [...(listeners.get(name) ?? []), listener as Listener<keyof AppEvents>]);
  },

  /** Never throws and never waits for the listeners. */
  emit<K extends keyof AppEvents>(name: K, event: AppEvents[K]): void {
    for (const listener of listeners.get(name) ?? []) {
      void Promise.resolve()
        .then(() => listener(event as never))
        .catch((err) => logger.error({ err, event: name }, 'event listener failed'));
    }
  },

  /** For tests: drops every listener. */
  clear(): void {
    listeners.clear();
  },
};
