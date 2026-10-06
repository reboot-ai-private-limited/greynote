import { logger } from '@/shared/logging/logger.js';

export interface IntervalJob {
  /** Stops the timer. A run in progress finishes. */
  stop(): void;
}

/**
 * Runs `task` once now and then every `everyMs`, inside the server — for work that must happen without an operator's cron. A run
 * that throws is logged and the next one still happens; a run still going when the next is due makes that one wait, never overlap.
 * The task has to be safe to run at any time and from several servers at once. The timer never keeps the process alive.
 */
export function startIntervalJob(name: string, everyMs: number, task: () => Promise<unknown>): IntervalJob {
  let running = false;
  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const outcome = await task();
      logger.info({ job: name, outcome }, 'scheduled job finished');
    } catch (err) {
      logger.error({ job: name, err }, 'scheduled job failed');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), everyMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
