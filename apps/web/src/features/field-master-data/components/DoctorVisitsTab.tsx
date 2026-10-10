'use client';

import type { DoctorDto } from '@greynote/contracts';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { StatTile } from '@/components/ui/StatTile';
import { useDoctorVisits } from '@/features/reports/hooks/useDcrReport';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';

/** This doctor's visits in a month against its frequency, read from the responsible MR's visit report. */
export function DoctorVisitsTab({ doctor }: { doctor: DoctorDto }) {
  const [month, setMonth] = useState(istDate().slice(0, 7));
  const mrId = doctor.assignedTo?.userId;
  const query = useDoctorVisits(month, mrId, mrId !== undefined && doctor.visitFrequency !== null);
  const row = query.data?.mrs.flatMap((m) => m.rows).find((r) => r.doctor.id === doctor.id);

  if (doctor.visitFrequency === null) {
    return (
      <Card title="Visits">
        <p className="p-5 text-sm text-text-muted">
          No visit frequency is set for this doctor. Set one in Details to track missed visits.
        </p>
      </Card>
    );
  }
  if (!mrId) {
    return (
      <Card title="Visits">
        <p className="p-5 text-sm text-text-muted">
          No MR is responsible for this doctor yet, so no visits are tracked.
        </p>
      </Card>
    );
  }
  return (
    <Card
      title="Visits"
      description={`Should be visited ${doctor.visitFrequency} a month by ${doctor.assignedTo?.name}. Only calls on submitted or approved daily reports count.`}
    >
      <div className="space-y-4 p-5">
        <div className="max-w-xs">
          <FormField label="Month" htmlFor="doctor-visits-month">
            <Input
              id="doctor-visits-month"
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </FormField>
        </div>
        {query.error ? (
          <p role="alert" className="text-sm text-danger-fg">
            {toErrorState(query.error).message}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Should visit" value={String(doctor.visitFrequency)} />
            <StatTile label="Called" value={query.isLoading ? '…' : String(row?.made ?? 0)} />
            <StatTile
              label="Missed"
              value={query.isLoading ? '…' : String(row?.missed ?? doctor.visitFrequency)}
              tone={(row?.missed ?? doctor.visitFrequency) > 0 ? 'warning' : undefined}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
