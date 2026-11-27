import { getCallPerformance, type CallPerformance } from '@/lib/my-reports';
import { useCachedFetch } from '@/offline/cached-fetch';

import { ThemedText } from './themed-text';
import { InfoCard } from './ui-cards';

const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
const avg = (v: number | null) => (v === null ? '—' : v.toFixed(1));

/**
 * One person's month (2026-11-27): doctor and chemist calls per field working day, and how their doctors were covered — met at least
 * once, met as often as their frequency, visits made of those owed. For a manager the coverage is their team's. Online; the last answer
 * is kept for offline.
 */
export function CallPerformanceCard({ userId, month }: { userId: string; month: string }) {
  const report = useCachedFetch<CallPerformance>(`call-performance:${month}`, () => getCallPerformance(month));
  const row = report.data?.rows.find((r) => r.employee.id === userId) ?? null;
  if (!row) return null;
  const c = row.coverage;
  return (
    <InfoCard>
      <ThemedText type="smallBold">{`Call average: ${avg(row.doctorCallAvg)} doctors · ${avg(row.chemistCallAvg)} chemists a day`}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{`${row.doctorCalls} doctor and ${row.chemistCalls} chemist calls on ${row.fieldDays} field day${row.fieldDays === 1 ? '' : 's'}`}</ThemedText>
      <ThemedText type="smallBold">{`${row.scope === 'TEAM' ? 'Team coverage' : 'Coverage'}: ${pct(c.coveragePct)} (${c.met} of ${c.doctors} doctors met)`}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {`Frequency coverage ${pct(c.frequencyPct)} (${c.metFully} of ${c.withFrequency}) · visits ${c.made} of ${c.required} (${pct(c.compliancePct)})${c.missed > 0 ? ` · ${c.missed} never met` : ''}`}
      </ThemedText>
    </InfoCard>
  );
}
