import { useMemo } from 'react';

import { useRecords, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { addDays, prettyDay } from '@/offline/day';
import type { ConfigSnapshot } from '@/types/sync';

/** `DOCTOR_VISIT_GAP_DAYS`: 0 to 9, 0 = off. The server's default (8) until the first pull. */
const parseGap = (raw: string | undefined) => {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 9 ? n : 8;
};

/** `short` goes on the doctor's line in a picker ("Next visit from Sun 11 Oct"); `text` is the full reason. */
export type VisitTooSoon = { lastVisit: string; nextAllowed: string; short: string; text: string };

/**
 * The days between visits to a doctor (docs/mobile/dcr.md rule 11): after a doctor call or follow-up on day D, this employee
 * can't record another on that doctor until D + `DOCTOR_VISIT_GAP_DAYS`, counted both ways. Worked out from this phone's own
 * doctor calls and follow-ups (sent and unsent), so a visit the server would refuse (`DOCTOR_VISIT_TOO_SOON`) is greyed out
 * before it is made. The server still decides: it also sees records from another phone. Returns why a doctor can't be
 * visited on `day`, or `null` when it can. The record being edited doesn't count against itself.
 */
export function useDoctorVisitGap(day: string, editing: OutboxRecord | 'new' | null): (doctorId: string) => VisitTooSoon | null {
  const config = useCachedSource<ConfigSnapshot>('config');
  const gap = parseGap(config.data?.settings.DOCTOR_VISIT_GAP_DAYS);
  const { records } = useRecords(['DOCTOR_CALL', 'DOCTOR_FOLLOWUP']);
  const editingId = editing && editing !== 'new' ? editing.clientId : null;

  const visitsByDoctor = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of records) {
      // A removed record no longer counts, and neither does one the server refused.
      if (r.deleted || r.status === 'FAILED' || r.clientId === editingId) continue;
      const p = r.payload as { reportDate?: string; doctorId?: string };
      if (!p.doctorId || !p.reportDate) continue;
      map.set(p.doctorId, [...(map.get(p.doctorId) ?? []), p.reportDate]);
    }
    return map;
  }, [records, editingId]);

  return (doctorId: string) => {
    if (gap === 0) return null;
    const from = addDays(day, -(gap - 1));
    const to = addDays(day, gap - 1);
    const visits = [...new Set(visitsByDoctor.get(doctorId) ?? [])].filter((d) => d >= from && d <= to).sort();
    if (visits.length === 0) return null;
    // As the server explains it: the nearest visit on or before the day, failing that the first one after it.
    const earlier = visits.filter((d) => d <= day);
    const lastVisit = earlier.length > 0 ? earlier[earlier.length - 1]! : visits[0]!;
    const nextAllowed = addDays(lastVisit, gap);
    const text =
      lastVisit <= day
        ? `You visited this doctor on ${prettyDay(lastVisit)}. The next visit can be from ${prettyDay(nextAllowed)} (${gap} days apart).`
        : `You already have a visit to this doctor on ${prettyDay(lastVisit)}, less than ${gap} days after this one.`;
    const short = lastVisit <= day ? `Next visit from ${prettyDay(nextAllowed)}` : `Visit on ${prettyDay(lastVisit)} already`;
    return { lastVisit, nextAllowed, short, text };
  };
}
