'use client';

import type { SalesDashboardRowDto } from '@greynote/contracts';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { ListToolbar, SearchInput } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { StatTile } from '@/components/ui/StatTile';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { rangeError } from '@/lib/dateRange';
import { istDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSalesDashboard } from '../hooks/useSalesDashboard';
import { rangeLabel } from '../lib/employeeSales';
import {
  achievementPercent,
  complianceText,
  complianceTone,
  parsePreset,
  presetRange,
  PRESET_OPTIONS,
  routesText,
  salesDashboardCsv,
  salesDashboardFilename,
} from '../lib/salesDashboard';

/** The most days the API reads at once (SALES_DASHBOARD_MAX_DAYS). */
const MAX_DAYS = 93;

const money = (paise: number): string => formatMoney(paise);

function customRangeError(from: string, to: string): string | undefined {
  const bad = rangeError(from, to);
  if (bad) return bad;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return days > MAX_DAYS ? `Choose at most ${MAX_DAYS} days at a time.` : undefined;
}

/**
 * The whole field force on one page: for each field employee, whether the day plan and daily report are in, the TA and DA claimed, and the
 * employee's target against what they sold. Today, the last 7 days, or any range. Office staff are not listed. Target, primary and achievement
 * cover the months of the range; a row opens that employee's targets and monthly figures.
 */
export function SalesDashboardScreen() {
  const { values, page, pageSize, update } = useFilterParams(['range', 'from', 'to', 'q']);
  const today = istDate();
  const preset = parsePreset(values.range);
  const custom = preset === 'custom';
  const range = custom
    ? { from: values.from || today, to: values.to || today }
    : presetRange(preset, today);
  const problem = custom ? customRangeError(range.from, range.to) : undefined;
  const query = useSalesDashboard(
    { ...range, search: values.q || undefined, page, pageSize },
    !problem,
  );
  const data = query.data;
  const router = useRouter();
  const single = data ? data.from === data.to : range.from === range.to;
  const months = rangeLabel(data?.fromMonth ?? range.from.slice(0, 7), data?.toMonth ?? range.to.slice(0, 7));

  const columns: readonly Column<SalesDashboardRowDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <>
          <span className="font-medium text-text">{r.employee.name}</span>{' '}
          <span className="text-text-subtle">{r.employee.employeeCode}</span>
        </>
      ),
    },
    { key: 'zone', header: 'Zone', render: (r) => r.zone ?? '—' },
    { key: 'designation', header: 'Designation', render: (r) => r.designation ?? '—' },
    {
      key: 'plan',
      header: 'Day plan',
      render: (r) => (
        <Badge tone={complianceTone(r.plan, r.workingDays)}>
          {complianceText(r.plan, r.workingDays, single)}
        </Badge>
      ),
    },
    {
      key: 'dcr',
      header: 'DCR',
      render: (r) => (
        <Badge tone={complianceTone(r.dcr, r.workingDays)}>
          {complianceText(r.dcr, r.workingDays, single)}
        </Badge>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (r) => <span title={r.routes.join(', ')}>{routesText(r.routes)}</span>,
    },
    { key: 'ta', header: 'TA', numeric: true, render: (r) => money(r.taPaise) },
    { key: 'da', header: 'DA', numeric: true, render: (r) => money(r.daPaise) },
    {
      key: 'target',
      header: 'Target',
      numeric: true,
      render: (r) =>
        r.mrCount === 0 ? (
          <span className="text-text-subtle">No MRs under them</span>
        ) : r.targetPaise === null ? (
          <span className="text-text-subtle">Not set</span>
        ) : (
          <>
            {money(r.targetPaise)}
            {r.mrCount ? <span className="ml-1.5 text-xs text-text-muted">{r.mrCount} MRs</span> : null}
          </>
        ),
    },
    { key: 'primary', header: 'Primary', numeric: true, render: (r) => money(r.primaryPaise) },
    {
      key: 'achieved',
      header: 'Achievement',
      numeric: true,
      render: (r) => {
        if (r.mrCount === 0) return <span className="text-text-subtle">—</span>;
        if (r.achievedPaise === null) return <span className="text-text-subtle">Nothing entered</span>;
        const percent = achievementPercent(r);
        return (
          <>
            {money(r.achievedPaise)}
            {percent !== null ? (
              <span className="ml-1.5 text-xs text-text-muted">{percent}%</span>
            ) : null}
          </>
        );
      },
    },
  ];

  const totals = data?.totals;
  const totalPercent =
    totals && totals.targetPaise > 0
      ? Math.round((totals.achievedPaise / totals.targetPaise) * 100)
      : null;
  return (
    <>
      <PageHeader
        title="Sales dashboard"
        description={`Field employees only. Plans and reports count the employee's working days; target, primary and achievement (what their distributors sold on) cover ${months}. Open an employee to set targets and enter figures.`}
        actions={
          <Button
            variant="secondary"
            disabled={!data || data.rows.length === 0}
            onClick={() =>
              data &&
              downloadCsv(salesDashboardFilename(data.from, data.to), salesDashboardCsv(data.rows))
            }
          >
            Download CSV (this page)
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Field employees" value={totals?.employees ?? 0} />
        <StatTile label="TA" value={money(totals?.taPaise ?? 0)} />
        <StatTile label="DA" value={money(totals?.daPaise ?? 0)} />
        <StatTile label="Target" value={money(totals?.targetPaise ?? 0)} note={months} />
        <StatTile
          label="Achievement"
          value={money(totals?.achievedPaise ?? 0)}
          {...(totalPercent !== null ? { note: `${totalPercent}% of target` } : {})}
        />
      </div>

      <ListToolbar>
        <DateRangeFilter
          value={{ preset, from: range.from, to: range.to }}
          presets={PRESET_OPTIONS}
          max={today}
          error={problem}
          onChange={(next) =>
            update({
              ...(next.preset !== undefined && {
                range: next.preset === 'today' ? undefined : next.preset,
              }),
              ...(next.from !== undefined && { from: next.from }),
              ...(next.to !== undefined && { to: next.to }),
            })
          }
        />
        <SearchInput
          label="Search employees"
          placeholder="Search by name or code"
          value={values.q}
          onChange={(q) => update({ q })}
        />
      </ListToolbar>

      <DataState
        isLoading={!problem && query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!problem && !!data && data.rows.length === 0}
        empty={{
          title: 'No field employees found',
          description: values.q ? 'Try a different search.' : 'Active field employees appear here.',
        }}
      >
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.employee.id}
          onRowClick={(r) => router.push(`/reports/sales-dashboard/${r.employee.id}`)}
        />
        {data ? (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={(p) => update({ page: p })}
            onPageSizeChange={(s) => update({ pageSize: s })}
          />
        ) : null}
      </DataState>
    </>
  );
}
