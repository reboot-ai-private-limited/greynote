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

/** `short` goes on the doctor's line in a picker ("Extra visit · counts from Sun 11 Oct"); `text` is the full reason. */
export type VisitTooSoon = { lastVisit: string; nextAllowed: string; short: string; text: string };

/**
 * The days between visits to a doctor (docs/mobile/dcr.md rule 11; allowed but not counted since 2026-11-28): after a counted doctor
 * call or follow-up on day D, another on that doctor before D + `DOCTOR_VISIT_GAP_DAYS` (counted both ways) is an extra visit. It is
 * saved and shown, but the server leaves it out of frequency, call average and coverage. Worked out from this phone's own doctor
 * calls and follow-ups (sent and unsent) so the employee is told before saving; the server decides, as it also sees another phone's
 * records. Returns why a visit on `day` would be extra, or `null` when it counts. The record being edited doesn't count against itself.
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
    // Only counted visits hold the next one back: walking in date order, a visit within the gap of the last counted one is extra.
    const counted: string[] = [];
    for (const d of [...new Set(visitsByDoctor.get(doctorId) ?? [])].sort()) if (counted.length === 0 || d >= addDays(counted[counted.length - 1]!, gap)) counted.push(d);
    const visits = counted.filter((d) => d >= from && d <= to);
    if (visits.length === 0) return null;
    // As the server explains it: the nearest visit on or before the day, failing that the first one after it.
    const earlier = visits.filter((d) => d <= day);
    const lastVisit = earlier.length > 0 ? earlier[earlier.length - 1]! : visits[0]!;
    const nextAllowed = addDays(lastVisit, gap);
    const text =
      lastVisit <= day
        ? `You visited this doctor on ${prettyDay(lastVisit)}. You can still call: it is saved, but not counted in frequency, call average or coverage. The next counted visit can be from ${prettyDay(nextAllowed)}.`
        : `You have a visit to this doctor on ${prettyDay(lastVisit)}, less than ${gap} days after this one. You can still call: it is saved, but not counted.`;
    const short = lastVisit <= day ? `Extra visit · counts from ${prettyDay(nextAllowed)}` : `Extra visit · not counted`;
    return { lastVisit, nextAllowed, short, text };
  };
}
