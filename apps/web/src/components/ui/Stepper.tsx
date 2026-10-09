import { Check } from 'lucide-react';
import { cn } from './cn';

export interface StepperItem {
  key: string;
  label: string;
  optional?: boolean;
  /** Finished and valid. */
  done: boolean;
  /** May be opened now. */
  reachable: boolean;
}

/**
 * Numbered steps on a line. Done steps are filled with a tick, the current one is ringed, the ones ahead are muted and
 * cannot be clicked until the steps before them are done. On a phone it shrinks to "Step 3 of 8 · Bank" over a bar.
 */
export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: readonly StepperItem[];
  current: string;
  onSelect: (key: string) => void;
}) {
  const index = Math.max(
    0,
    steps.findIndex((s) => s.key === current),
  );
  const active = steps[index];

  return (
    <nav aria-label="Progress">
      <div className="sm:hidden">
        <p className="mb-2 text-sm text-text-muted">
          Step {index + 1} of {steps.length} ·{' '}
          <span className="font-medium text-text">{active?.label}</span>
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="hidden items-start sm:flex">
        {steps.map((step, i) => {
          const isCurrent = i === index;
          return (
            <li key={step.key} className={cn('relative flex flex-1 flex-col items-center')}>
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2',
                    steps[i - 1]?.done ? 'bg-accent' : 'bg-border',
                  )}
                />
              ) : null}
              <button
                type="button"
                disabled={!step.reachable}
                onClick={() => onSelect(step.key)}
                aria-current={isCurrent ? 'step' : undefined}
                className="group relative flex flex-col items-center gap-2 focus-visible:outline-none disabled:cursor-not-allowed"
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    'group-focus-visible:shadow-focus',
                    step.done && !isCurrent && 'border-accent bg-accent text-accent-text',
                    isCurrent && 'border-accent bg-surface text-accent ring-4 ring-accent/15',
                    !step.done && !isCurrent && 'border-border-strong bg-surface text-text-subtle',
                  )}
                >
                  {step.done && !isCurrent ? <Check aria-hidden className="size-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-center text-[13px] leading-tight',
                    isCurrent
                      ? 'font-semibold text-text'
                      : step.reachable
                        ? 'text-text-muted'
                        : 'text-text-subtle',
                  )}
                >
                  {step.label}
                  {step.optional ? (
                    <span className="block text-[11px] font-normal text-text-subtle">Optional</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
