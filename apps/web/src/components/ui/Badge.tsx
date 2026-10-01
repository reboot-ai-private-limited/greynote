import type { ReactNode } from 'react';
import { cn } from './cn';

const tones = {
  neutral: { chip: 'bg-surface-hover text-text-muted', dot: 'bg-text-subtle' },
  accent: { chip: 'bg-accent-soft text-accent-soft-text', dot: 'bg-accent' },
  success: { chip: 'bg-success-bg text-success-fg', dot: 'bg-success' },
  warning: { chip: 'bg-warning-bg text-warning-fg', dot: 'bg-warning' },
  danger: { chip: 'bg-danger-bg text-danger-fg', dot: 'bg-danger' },
} as const;

export type BadgeTone = keyof typeof tones;

/** A status chip. The dot carries the colour for people who can't rely on the tint alone. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone].chip,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', tones[tone].dot)} />
      {children}
    </span>
  );
}
