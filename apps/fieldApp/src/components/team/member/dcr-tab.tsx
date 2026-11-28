import { router } from 'expo-router';

import { reportChip } from '@/lib/team-section';
import { downloadMonthlyWorkReport } from '@/lib/work-reports';
import { prettyDay, prettyMonth } from '@/offline/day';

import { ReportList, ReportRow } from '../../report-kit';
import { usePersonDays } from './plans-tab';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const APPROVED = ['APPROVED', 'MANAGER_APPROVED'];

/**
 * A team member's daily reports for the month (2026-11-28), like your own DCR report: tiles, then one row a day (calls, follow-ups, where it
 * stands); a tap opens that day's report. The Excel is their Monthly work sheet, the one Admin downloads, which holds every day in full.
 */
export function DcrTab({ userId, month, personName }: { userId: string; month: string; personName: string }) {
  const days = usePersonDays(userId, month);
  const rows = (days.data?.items ?? []).filter((d) => d.report !== null).sort((a, b) => b.date.localeCompare(a.date));
  const approved = rows.filter((d) => APPROVED.includes(d.report!.status)).length;
  const sentBack = rows.filter((d) => d.report!.status === 'REJECTED').length;
  return (
    <ReportList
      title="Daily reports"
      rows={rows}
      state={days}
      hasData={days.data !== null}
      tiles={[
        { label: 'Reports', value: rows.length, accent: 'blue' },
        { label: 'Approved', value: approved, accent: 'green' },
        { label: 'Sent back', value: sentBack, accent: sentBack > 0 ? 'red' : 'slate' },
      ]}
      empty="No daily reports this month."
      render={(d) => {
        const r = d.report!;
        const chip = reportChip(r.status);
        return (
          <ReportRow
            key={d.date}
            title={prettyDay(d.date)}
            subtitle={`${plural(r.doctorCalls, 'doctor call')} · ${plural(r.chemistCalls, 'chemist call')} · ${plural(r.followups, 'follow-up')}${d.summary.missed > 0 ? ` · ${d.summary.missed} missed` : ''}`}
            pill={{ text: chip.text, accent: chip.accent }}
            onPress={r.id ? () => router.push({ pathname: '/dcr-report/[id]', params: { id: r.id! } }) : undefined}
          />
        );
      }}
      download={() => downloadMonthlyWorkReport({ id: userId, name: personName }, month, prettyMonth(month))}
    />
  );
}
