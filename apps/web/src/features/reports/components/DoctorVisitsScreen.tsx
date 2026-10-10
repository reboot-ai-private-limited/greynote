'use client';

import type { DoctorVisitMrDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useDoctorVisits } from '../hooks/useDcrReport';
import { doctorVisitsCsv, doctorVisitsFilename, progressPercent } from '../lib/doctorVisits';
import { DoctorVisitsDialog } from './DoctorVisitsDialog';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Each doctor's monthly visit frequency against the calls made on submitted or approved daily reports: per employee the visits
 * expected, made and missed, and, per employee, which doctors are behind. Doctors with no frequency are not tracked.
 */
export function DoctorVisitsScreen() {
  const { values, update } = useFilterParams(['month']);
  const month = MONTH.test(values.month ?? '') ? values.month! : istDate().slice(0, 7);
  const query = useDoctorVisits(month);
  const report = query.data;
  const [open, setOpen] = useState<DoctorVisitMrDto | null>(null);

  const columns: readonly Column<DoctorVisitMrDto>[] = [
    {
      key: 'mr',
      header: 'Employee',
      render: (m) => (
        <span className="font-medium">
          {m.mr.name} <span className="font-normal text-text-subtle">{m.mr.employeeCode}</span>
        </span>
      ),
    },
    {
      key: 'doctors',
      header: 'Doctors tracked',
      numeric: true,
      render: (m) => `${m.completedDoctors} of ${m.doctors} done`,
    },
    { key: 'quota', header: 'Visits due', numeric: true, render: (m) => m.quota },
    { key: 'made', header: 'Made', numeric: true, render: (m) => m.made },
    {
      key: 'missed',
      header: 'Missed',
      numeric: true,
      render: (m) =>
        m.missed > 0 ? (
          <Badge tone="warning">{`${m.missed} missed`}</Badge>
        ) : (
          <Badge tone="success">Done</Badge>
        ),
    },
    {
      key: 'progress',
      header: 'Progress',
      numeric: true,
      render: (m) => `${progressPercent(m) ?? 0}%`,
    },
    {
      key: 'doctorsBtn',
      header: '',
      className: 'text-right',
      render: (m) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(m)}
          aria-label={`Doctors of ${m.mr.name}`}
        >
          Doctors
        </Button>
      ),
    },
  ];

  const t = report?.totals;
  const pct = t ? progressPercent(t) : null;
  return (
    <>
      <PageHeader
        title="Doctor visits"
        description="Each doctor's monthly visit frequency against the calls made. Only calls on submitted or approved daily reports count; doctors without a frequency are not tracked."
        actions={
          <Button
            variant="secondary"
            disabled={!report || report.mrs.length === 0}
            onClick={() =>
              report && downloadCsv(doctorVisitsFilename(month), doctorVisitsCsv(report.mrs))
            }
          >
            Download CSV
          </Button>
        }
      />
      <div className="mb-6 max-w-xs">
        <FormField label="Month" htmlFor="visits-month">
          <Input
            id="visits-month"
            type="month"
            value={month}
            onChange={(e) => e.target.value && update({ month: e.target.value })}
          />
        </FormField>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Visits due"
          value={String(t?.quota ?? 0)}
          note={`${t?.doctors ?? 0} doctors tracked`}
        />
        <StatTile
          label="Made"
          value={String(t?.made ?? 0)}
          {...(pct === null ? {} : { note: `${pct}% of due` })}
        />
        <StatTile
          label="Missed"
          value={String(t?.missed ?? 0)}
          tone={t && t.missed > 0 ? 'warning' : undefined}
        />
        <StatTile
          label="Doctors fully visited"
          value={String(t?.completedDoctors ?? 0)}
          note={`of ${t?.doctors ?? 0}`}
        />
      </div>
      <Card flat title="By employee" description="Most missed first.">
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={!report || report.mrs.length === 0}
          empty={{
            title: 'No doctor has a visit frequency',
            description: 'Set one on the doctor, or when an MR adds the doctor.',
          }}
        >
          <DataTable columns={columns} rows={report?.mrs ?? []} rowKey={(m) => m.mr.id} />
        </DataState>
      </Card>
      {open ? <DoctorVisitsDialog row={open} month={month} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
