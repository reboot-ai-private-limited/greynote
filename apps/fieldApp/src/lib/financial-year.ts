import { useEffect, useSyncExternalStore } from 'react';

import { useCachedSource } from '@/offline/cache';
import { isOnline, useOnline } from '@/offline/connectivity';
import { businessToday, datesInMonth } from '@/offline/day';
import { store } from '@/offline/store';
import type { ConfigSnapshot } from '@/types/sync';

import { apiGet, setFinancialYearHeader } from './api';
import { useSessionUser } from './session';

/**
 * The financial-year "time machine" (HLD 9). A financial year is named by the year it starts in (with an April
 * start, FY2025 runs 2025-04-01 to 2026-03-31). Picking a past year makes the screens that honour it read that
 * year, read-only: Reports, the Holiday List and the Orders list. It is kept for this sign-in only and is never
 * sent with a save or a sync — the server refuses every write while a past year is selected.
 */
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const pad = (n: number) => String(n).padStart(2, '0');

/** `FY_START_MONTH` ("APRIL") as 1–12; April when it is missing or unreadable. */
export function fyStartMonth(setting: string | null | undefined): number {
  const index = MONTH_NAMES.indexOf((setting ?? '').trim().toUpperCase());
  return index === -1 ? 4 : index + 1;
}

/** The financial year a day falls in. */
export function fyOf(isoDate: string, startMonth: number): number {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return month >= startMonth ? year : year - 1;
}

/** First and last calendar day of a financial year, and its first and last month (`YYYY-MM`). */
export function fyRange(year: number, startMonth: number) {
  const firstMonth = `${year}-${pad(startMonth)}`;
  const lastMonth = startMonth === 1 ? `${year}-12` : `${year + 1}-${pad(startMonth - 1)}`;
  const days = datesInMonth(lastMonth);
  return { firstMonth, lastMonth, from: `${firstMonth}-01`, to: days[days.length - 1]! };
}

/** "FY 2025-26", or "FY 2025" for a calendar-year start. */
export const fyLabel = (year: number, startMonth: number) => (startMonth === 1 ? `FY ${year}` : `FY ${year}-${String(year + 1).slice(2)}`);

/** How many past years the switch offers. */
export const FY_YEARS_BACK = 5;

let selected: { year: number; userId: string } | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Picks a past year, or `null` to go back to the current one. */
export function selectFinancialYear(year: number | null, userId: string) {
  selected = year === null ? null : { year, userId };
  setFinancialYearHeader(year);
  listeners.forEach((l) => l());
}

/* ── closed years: `GET /config/public` → `closedFinancialYears` (start years). Public, so no sign-in needed; the last answer is kept for offline. ── */
const CLOSED_META = 'fy:closedYears';
const CLOSED_REFRESH_MS = 5 * 60_000;
let closedYears: number[] = [];
let closedFetchedAt = 0;
let closedLoading: Promise<void> | null = null;
let closedRestored = false;

const setClosedYears = (years: number[]) => {
  if (years.length === closedYears.length && years.every((y, i) => y === closedYears[i])) return;
  closedYears = years;
  listeners.forEach((l) => l());
};

/** Reads the closed years (at most every few minutes); a failed read keeps what the phone already has. */
async function refreshClosedYears() {
  if (closedLoading) return closedLoading;
  if (!closedRestored) {
    closedRestored = true;
    try {
      const raw = await store.getMeta(CLOSED_META);
      if (raw) setClosedYears(JSON.parse(raw) as number[]);
    } catch {
      /* no copy yet */
    }
  }
  if (!isOnline() || Date.now() - closedFetchedAt < CLOSED_REFRESH_MS) return;
  closedLoading = (async () => {
    try {
      const config = await apiGet<{ closedFinancialYears?: number[] }>('/config/public', { auth: false });
      const years = [...(config.closedFinancialYears ?? [])].sort((a, b) => a - b);
      closedFetchedAt = Date.now();
      setClosedYears(years);
      await store.setMeta(CLOSED_META, JSON.stringify(years)).catch(() => undefined);
    } catch {
      /* keep the copy */
    }
  })().finally(() => {
    closedLoading = null;
  });
  return closedLoading;
}

const getClosedYears = () => closedYears;

export type FinancialYearState = {
  /** The year being looked at (the current one unless a past year was picked). */
  year: number;
  current: number;
  startMonth: number;
  /** A past year is selected: everything is read-only. */
  isPast: boolean;
  /** The year in view has been closed by Admin: read-only, and the server refuses any dated work in it (`FY_CLOSED`). */
  closed: boolean;
  /** Start years of every closed financial year. */
  closedYears: number[];
  label: string;
  from: string;
  to: string;
  firstMonth: string;
  lastMonth: string;
  today: string;
  /** Current year first, then up to FY_YEARS_BACK earlier ones. */
  options: { year: number; label: string }[];
};

/** The selected financial year and its bounds. Re-reads when the year is switched. */
export function useFinancialYear(): FinancialYearState {
  const user = useSessionUser();
  const config = useCachedSource<ConfigSnapshot>('config');
  const pick = useSyncExternalStore(subscribe, () => selected);
  const closedList = useSyncExternalStore(subscribe, getClosedYears);
  const online = useOnline();
  const userId = user?.id ?? null;

  useEffect(() => {
    void refreshClosedYears();
  }, [online]);

  const startMonth = fyStartMonth(config.data?.settings.FY_START_MONTH);
  const today = businessToday(config.data?.settings.BUSINESS_TIMEZONE, new Date(), config.data?.settings.DAY_START_TIME);
  const current = fyOf(today, startMonth);
  const own = pick && pick.userId === userId && pick.year < current ? pick.year : null;

  // A pick left over from another employee, or one that is no longer past, must not keep the header on.
  useEffect(() => {
    if (own === null) setFinancialYearHeader(null);
    else setFinancialYearHeader(own);
  }, [own]);

  const year = own ?? current;
  return {
    year,
    current,
    startMonth,
    isPast: own !== null,
    closed: closedList.includes(year),
    closedYears: closedList,
    label: fyLabel(year, startMonth),
    ...fyRange(year, startMonth),
    today,
    options: Array.from({ length: FY_YEARS_BACK + 1 }, (_, i) => ({ year: current - i, label: fyLabel(current - i, startMonth) })),
  };
}
