'use client';

import { ChevronDown, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { formatMoney } from '@/lib/format';
import { monthlyOf } from '../../lib/ctc';
import { describeRule, type EditorRow, type RuleDraft } from '../../lib/ctcStructure';
import { RuleFields } from './RuleFields';

const inr = (rupees: string): string => formatMoney(Math.round(Number(rupees || 0) * 100));

/**
 * One line of the breakdown: name, how it is worked out (a readable chip), and what it comes to. A line that can be changed opens
 * in place when clicked (no dialog over a dialog); Basic and "Other allowance" are locked and say why.
 */
export function CtcLineRow({
  row,
  annualPaise,
  nameOf,
  bases,
  open,
  onToggle,
  onRule,
  onReset,
  onRemove,
  removeBlocked,
  error,
  readOnly = false,
}: {
  row: EditorRow;
  annualPaise: number | undefined;
  nameOf: (code: string) => string;
  bases: readonly EditorRow[];
  open: boolean;
  onToggle: () => void;
  onRule: (rule: RuleDraft) => void;
  onReset: (() => void) | null;
  onRemove: () => void;
  /** Why it cannot be removed right now, or `null`. */
  removeBlocked: string | null;
  error: string | undefined;
  /** Shown only, with no way to open or change it (the breakdown while "Customise components" is closed). */
  readOnly?: boolean;
}) {
  const locked = row.lockedReason !== null || readOnly;
  const chip = describeRule(row.rule, nameOf, inr);
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-text">
          {row.name || <span className="text-text-subtle">New line</span>}
          {row.edited && row.code !== 'BASIC' ? (
            <span
              aria-label={row.extraId ? 'Added for this employee' : 'Changed for this employee'}
              title={row.extraId ? 'Added for this employee' : 'Changed for this employee'}
              className="size-1.5 rounded-full bg-accent"
            />
          ) : null}
          {row.lockedReason !== null ? <Lock aria-hidden className="size-3.5 text-text-subtle" /> : null}
        </span>
        <span className="mt-1 inline-flex max-w-full rounded-md bg-surface-hover px-2 py-0.5 text-xs text-text-muted">
          {chip}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-sm font-semibold tabular-nums text-text">
          {annualPaise === undefined ? '—' : formatMoney(annualPaise)}
        </span>
        <span className="block text-xs tabular-nums text-text-subtle">
          {annualPaise === undefined ? '' : `${formatMoney(monthlyOf(annualPaise))} a month`}
        </span>
      </span>
      {!locked ? (
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-text-subtle transition-transform',
            open && 'rotate-180',
          )}
        />
      ) : (
        <span className="size-4 shrink-0" />
      )}
    </>
  );

  return (
    <li>
      {locked ? (
        <div
          className="flex items-center gap-4 px-4 py-3 sm:px-5"
          title={row.lockedReason ?? undefined}
        >
          {body}
        </div>
      ) : (
        <div className="flex items-center">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left hover:bg-surface-subtle focus-visible:shadow-focus focus-visible:outline-none sm:px-5"
          >
            {body}
          </button>
          <button
            type="button"
            aria-label={`Remove ${row.name} for this employee`}
            title={removeBlocked ?? 'Remove for this employee'}
            disabled={removeBlocked !== null}
            onClick={onRemove}
            className="mr-3 rounded-md p-2 text-text-subtle hover:bg-surface-hover hover:text-danger-fg focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:mr-4"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      {open && row.rule !== 'BALANCER' ? (
        <div className="space-y-4 border-t border-border bg-surface-subtle px-4 py-4 sm:px-5">
          <RuleFields
            idPrefix={`line-${row.extraId ?? row.code}`}
            value={row.rule}
            onChange={onRule}
            bases={bases.filter((b) => b.code !== row.code)}
            error={error}
          />
          <div className="flex flex-wrap items-center gap-2">
            {onReset ? (
              <Button variant="secondary" size="sm" onClick={onReset}>
                Back to the formula
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={removeBlocked !== null}
              title={removeBlocked ?? undefined}
              onClick={onRemove}
            >
              Remove for this employee
            </Button>
            <Button size="sm" className="ml-auto" onClick={onToggle}>
              Done
            </Button>
          </div>
          {removeBlocked ? <p className="text-xs text-text-subtle">{removeBlocked}</p> : null}
        </div>
      ) : null}
      {error && !open ? (
        <p role="alert" className="px-4 pb-3 text-[13px] text-danger-fg sm:px-5">
          {error}
        </p>
      ) : null}
    </li>
  );
}
