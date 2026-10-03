import type { ChemistCallDto, DoctorCallDto } from '@greynote/contracts';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmployeeName } from '@/features/field-master-data/components/EmployeePickerField';
import { formatDateTime } from '@/lib/format';
import { GEOFENCE_LABEL, GEOFENCE_TONE, WORKING_TYPE_LABEL, geofenceDetail, isFlagged } from '../lib/review';

/**
 * One call on the report: who it was with, what the server's location check found, what was given and said.
 * `action` is where the reviewer's "accept this call" control goes, for a call that was flagged.
 */
export function CallCard({ call, action }: { call: DoctorCallDto | ChemistCallDto; action?: ReactNode }) {
  const name = 'doctorName' in call ? call.doctorName : call.chemistName;
  const samples = 'samples' in call ? call.samples : [];
  const flagged = isFlagged(call);

  return (
    <li className={`rounded-md border p-4 ${flagged ? 'border-warning bg-warning-bg/40' : 'border-border'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text">{name || 'Unknown'}</p>
          <p className="text-xs text-text-subtle">
            {formatDateTime(call.recordedAt)} · {WORKING_TYPE_LABEL[call.workingType]}
          </p>
        </div>
        <Badge tone={GEOFENCE_TONE[call.geofence.status]}>{GEOFENCE_LABEL[call.geofence.status]}</Badge>
      </div>
      <p className="mt-2 text-[13px] text-text-muted">{geofenceDetail(call.geofence)}</p>
      {call.capturedLocation && call.accuracyMeters !== null ? (
        <p className="text-xs text-text-subtle">Phone accuracy ±{Math.round(call.accuracyMeters)} m.</p>
      ) : null}
      {samples.length > 0 ? (
        <p className="mt-2 text-sm text-text">
          <span className="text-text-subtle">Samples: </span>
          {samples.map((s) => `${s.productName || 'Product'} × ${s.quantity}`).join(', ')}
        </p>
      ) : null}
      {call.workWith.length > 0 ? (
        <p className="mt-1 text-sm text-text">
          <span className="text-text-subtle">Worked with: </span>
          {call.workWith.map((id, i) => (
            <span key={id}>
              {i > 0 ? ', ' : ''}
              <EmployeeName userId={id} />
            </span>
          ))}
        </p>
      ) : null}
      {call.remarks ? <p className="mt-2 rounded-md bg-surface-subtle px-3 py-2 text-sm text-text-muted">“{call.remarks}”</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </li>
  );
}
