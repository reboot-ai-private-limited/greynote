'use client';

import type { PlanDayDto, PlannedDoctorDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/format';
import { useDoctor } from '@/features/field-master-data/hooks/useDoctors';
import { WorkWithName } from '@/features/people/components/EmployeePickerField';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { DAY_KIND_LABEL, WORKING_TYPE_LABEL } from '../lib/review';

function DoctorName({ doctorId }: { doctorId: string }) {
  const { data } = useDoctor(doctorId);
  return <>{data?.name ?? 'Doctor'}</>;
}

/** One planned day: what it is for, the routes, who they work with, the doctors to call, and any remarks. */
export function PlanDayView({ day }: { day: PlanDayDto & { doctors?: PlannedDoctorDto[] } }) {
  const directory = useTerritoryDirectory();
  return (
    <div className="space-y-2 text-sm">
      <Badge tone={day.workingType === 'FIELD_WORK' ? 'accent' : 'neutral'}>
        {WORKING_TYPE_LABEL[day.workingType]}
      </Badge>
      {day.dayKind !== 'NORMAL' ? <Badge tone="neutral">{DAY_KIND_LABEL[day.dayKind]}</Badge> : null}
      {day.routeIds.length > 0 ? (
        <p>
          <span className="text-text-subtle">Routes: </span>
          {day.routeIds.map((id) => directory.routeName(id)).join('; ')}
        </p>
      ) : null}
      {day.workWith.length > 0 ? (
        <p>
          <span className="text-text-subtle">Works with: </span>
          {day.workWith.map((id, i) => (
            <span key={id}>
              {i > 0 ? ', ' : ''}
              <WorkWithName userId={id} />
            </span>
          ))}
        </p>
      ) : null}
      {day.doctors && day.doctors.length > 0 ? (
        <div>
          <p>
            <span className="text-text-subtle">Doctors to call: </span>
            {day.doctors.length} ({day.doctors.filter((d) => d.carriedFrom !== null).length} carried
            over)
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {day.doctors.map((d) => (
              <li key={d.doctorId}>
                <DoctorName doctorId={d.doctorId} />
                {d.carriedFrom ? (
                  <span className="text-text-subtle">
                    {' '}
                    · missed, carried from {formatDate(d.carriedFrom)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {day.remarks ? (
        <p className="rounded-md bg-surface-subtle px-3 py-2 text-text-muted">“{day.remarks}”</p>
      ) : null}
    </div>
  );
}
