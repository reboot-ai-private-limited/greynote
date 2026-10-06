import { afterEach, describe, expect, it, vi } from 'vitest';
import { startIntervalJob } from './intervalJob.js';

afterEach(() => vi.useRealTimers());

describe('startIntervalJob', () => {
  it('runs once at once and then every interval, and stops when told', async () => {
    vi.useFakeTimers();
    const task = vi.fn().mockResolvedValue({ ok: true });
    const job = startIntervalJob('t', 1000, task);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(task).toHaveBeenCalledTimes(3);
    job.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('survives a failing run, and never overlaps a slow one', async () => {
    vi.useFakeTimers();
    let release: () => void = () => undefined;
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const job = startIntervalJob('t', 1000, task);
    await vi.advanceTimersByTimeAsync(0); // the failing first run
    await vi.advanceTimersByTimeAsync(1000); // second run starts and hangs
    await vi.advanceTimersByTimeAsync(3000); // three more ticks while it hangs
    expect(task).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(3);
    job.stop();
  });
});
