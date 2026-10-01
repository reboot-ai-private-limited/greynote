'use client';

import { useFinancialYear } from '@/lib/useFinancialYear';

const YEARS_BACK = 5;

/**
 * The Financial Year "time machine": a past year turns the whole panel read-only (the API rejects
 * writes with 409 FINANCIAL_YEAR_READ_ONLY). "Current" sends no header.
 */
export function FinancialYearSwitcher() {
  const { year, select } = useFinancialYear();
  const thisYear = new Date().getFullYear();

  return (
    <label className="flex items-center gap-2 text-sm text-text-subtle">
      Financial year
      <select
        value={year ?? ''}
        onChange={(e) => select(e.target.value === '' ? null : Number(e.target.value))}
        className="h-8 rounded-md border border-border-strong bg-surface px-2 text-text"
      >
        <option value="">Current</option>
        {Array.from({ length: YEARS_BACK }, (_, i) => thisYear - 1 - i).map((y) => (
          <option key={y} value={y}>
            {y}–{String(y + 1).slice(2)}
          </option>
        ))}
      </select>
    </label>
  );
}
