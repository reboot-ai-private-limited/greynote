import { formatPaise } from '@/shared/money/paise.js';

/**
 * A warning (never a refusal) when a new CTC is more than `percent` above the previous one — most likely a slipped
 * digit. A first CTC, a cut, or a rise within the limit gives `null`. The boundary is "more than": exactly `percent` is fine.
 */
export function ctcJumpWarning(previousPaise: number | null, nextPaise: number, percent: number): string | null {
  if (previousPaise === null || previousPaise <= 0) return null;
  if (nextPaise * 100 <= previousPaise * (100 + percent)) return null;
  return `This is more than ${percent}% above the previous CTC of ${formatPaise(previousPaise)} a year. Check the amount.`;
}
