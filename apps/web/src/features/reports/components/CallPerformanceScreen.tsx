'use client';

import type { CallPerformanceRowDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionLinks } from '@/components/ui/RowActions';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StatTile } from '@/components/ui/StatTile';
import { EmployeePickerField } from '@/features/people/components/EmployeePickerField';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useZoneOptions } from '@/features/territory/hooks/useParentOptions';
import { hqFilterOptions, pickHq, pickZone } from '@/features/territory/lib/routeFilters';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv, toCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { matchesSearch } from '@/lib/search';
import { downloadXlsx } from '@/lib/xlsx';
import { useCallPerformance } from '../hooks/useCallPerformance';
import { avgText, CALL_PERFORMANCE_HEADER, callPerformanceFilename, callPerformanceRows, pctText } from '../lib/callPerformance';
import { MissedDoctorsDialog } from './MissedDoctorsDialog';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Call average and coverage (decision-log 2026-11-27): per employee over whole months, doctor and chemist calls per field working day, and
 * how their doctors were covered — met at least once, met as often as their frequency, visits made of those owed. A manager's coverage is
 * their team's. Excel and CSV of the same table; "View missed" lists the doctors never met.
 */
export function CallPerformanceScreen() {
  const { values, update } = useFilterParams(['from', 'to', 'zoneId', 'hqId', 'managerId']);
  const thisMonth = istDate().slice(0, 7);
  const fromMonth = MONTH.test(values.from ?? '') ? values.from! : thisMonth;
  const toMonth = MONTH.test(values.to ?? '') && values.to! >= fromMonth ? values.to! : fromMonth;
  const zones = useZoneOptions();
  const hqs = useAllHqs();
  const query = useCallPerformance({ fromMonth, toMonth, ...(values.zoneId && { zoneId: values.zoneId }), ...(values.hqId && { hqId: values.hqId }), ...(values.managerId && { managerId: values.managerId }) });
  const report = query.data;
  const [search, setSearch] = useState('');
  const [missed, setMissed] = useState<CallPerformanceRowDto | null>(null);
  const rows = (report?.rows ?? []).filter((r) => matchesSearch(`${r.employee.name} ${r.employee.employeeCode}`, search));

  const columns: readonly Column<CallPerformanceRowDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <span className="font-medium">
          {r.employee.name} <span className="font-normal text-text-subtle">{r.employee.employeeCode}</span>
          {r.isManager ? (
            <>
              {' '}
              <Badge tone="accent">Team</Badge>
            </>
          ) : null}
        </span>
      ),
    },
    { key: 'days', header: 'Working days', numeric: true, render: (r) => r.workingDays ?? '—' },
    { key: 'dravg', header: 'Doctor call avg', numeric: true, render: (r) => <span className="font-medium">{avgText(r.doctorCallAvg)}</span> },
    { key: 'chavg', header: 'Chemist call avg', numeric: true, render: (r) => avgText(r.chemistCallAvg) },
    { key: 'held', header: 'Doctors', numeric: true, render: (r) => r.coverage.doctors },
    { key: 'cov', header: 'Coverage', numeric: true, render: (r) => `${pctText(r.coverage.coveragePct)} (${r.coverage.met})` },
    { key: 'freq', header: 'Frequency coverage', numeric: true, render: (r) => `${pctText(r.coverage.frequencyPct)} (${r.coverage.metFully} of ${r.coverage.withFrequency})` },
    { key: 'comp', header: 'Visit compliance', numeric: true, render: (r) => `${pctText(r.coverage.compliancePct)} (${r.coverage.made} of ${r.coverage.required})` },
    { key: 'missed', header: 'Never met', numeric: true, render: (r) => (r.coverage.missed > 0 ? <Badge tone="warning">{r.coverage.missed}</Badge> : <Badge tone="success">0</Badge>) },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => <ActionLinks label={r.employee.name} disabled={false} actions={[{ label: 'View missed', alwaysOn: true, onClick: () => setMissed(r) }]} />,
    },
  ];

  const t = report?.totals;
  const download = (ext: 'xlsx' | 'csv') => {
    if (!report) return;
    const cells = callPerformanceRows(report);
    const name = callPerformanceFilename(fromMonth, toMonth, ext);
    if (ext === 'csv') downloadCsv(name, toCsv(CALL_PERFORMANCE_HEADER, cells));
    else void downloadXlsx(name, 'Call average & coverage', CALL_PERFORMANCE_HEADER, cells);
  };

  return (
    <>
      <PageHeader
        title="Call average & coverage"
        description="Calls per field working day, and how each person's doctors were covered. Only counted daily reports count; a manager's coverage is their team's."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!report || report.rows.length === 0} onClick={() => download('csv')}>
              Download CSV
            </Button>
            <Button variant="secondary" disabled={!report || report.rows.length === 0} onClick={() => download('xlsx')}>
              Download Excel
            </Button>
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-44">
          <FormField label="From" htmlFor="cp-from">
            <Input id="cp-from" type="month" value={fromMonth} onChange={(e) => e.target.value && update({ from: e.target.value })} />
          </FormField>
        </div>
        <div className="w-44">
          <FormField label="To" htmlFor="cp-to">
            <Input id="cp-to" type="month" value={toMonth} min={fromMonth} onChange={(e) => e.target.value && update({ to: e.target.value })} />
          </FormField>
        </div>
        <div className="w-44">
          <FormField label="Zone" htmlFor="cp-zone">
            <SearchableSelect
              id="cp-zone"
              value={values.zoneId || 'all'}
              onValueChange={(v) => update(pickZone(hqs.data ?? [], { hqId: values.hqId }, v === 'all' ? '' : v))}
              options={[{ value: 'all', label: 'All zones' }, ...zones.options]}
              searchPlaceholder="Search zones"
            />
          </FormField>
        </div>
        <div className="w-48">
          <FormField label="HQ" htmlFor="cp-hq">
            <SearchableSelect
              id="cp-hq"
              value={values.hqId || 'all'}
              onValueChange={(v) => update(pickHq(hqs.data ?? [], { zoneId: values.zoneId }, v === 'all' ? '' : v))}
              options={[{ value: 'all', label: values.zoneId ? 'All HQs in the zone' : 'All HQs' }, ...hqFilterOptions(hqs.data ?? [], values.zoneId)]}
              searchPlaceholder="Search HQs"
            />
          </FormField>
        </div>
        <div className="w-64">
          <EmployeePickerField id="cp-manager" label="Team of" title="Show one manager’s team" value={values.managerId} onChange={(id) => update({ managerId: id })} />
        </div>
        <SearchInput value={search} onChange={setSearch} label="Search employees" placeholder="Search employee" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Doctor call average" value={avgText(t?.doctorCallAvg ?? null)} note={`${t?.doctorCalls ?? 0} calls · ${t?.workingDays ?? 0} working days`} />
        <StatTile label="Chemist call average" value={avgText(t?.chemistCallAvg ?? null)} note={`${t?.chemistCalls ?? 0} calls`} />
        <StatTile label="Doctor coverage" value={pctText(t?.coverage.coveragePct ?? null)} note={`${t?.coverage.met ?? 0} of ${t?.coverage.doctors ?? 0} doctors met`} />
        <StatTile label="Frequency coverage" value={pctText(t?.coverage.frequencyPct ?? null)} note={`Visit compliance ${pctText(t?.coverage.compliancePct ?? null)}`} />
      </div>
      <Card flat title="By employee" description="Managers first (their coverage is their team's), then by name. The tiles total the MRs once.">
        <DataState
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={!report || report.rows.length === 0}
          empty={{ title: 'Nobody to show', description: 'No field employee matches these filters.' }}
        >
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.employee.id} />
        </DataState>
      </Card>
      {missed ? <MissedDoctorsDialog employee={missed.employee} team={missed.isManager} fromMonth={fromMonth} toMonth={toMonth} onClose={() => setMissed(null)} /> : null}
    </>
  );
}
