'use client';

import type { DoctorServiceDto } from '@greynote/contracts';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FieldList } from '@/components/ui/FieldList';
import { serviceOriginLabel, serviceTypeLabel } from '@/features/approvals/lib/previews';
import { formatDate, formatMoney } from '@/lib/format';

/** "Rahul Das (EMP-102 · Sr. MR)"; falls back to the old origin wording when the server did not name the person. */
export function madeByLabel(s: DoctorServiceDto, designationName: (id: string | null) => string): string {
  const m = s.madeBy;
  if (!m) return serviceOriginLabel(s.origin);
  const detail = [m.employeeCode, designationName(m.designationId)].filter(Boolean).join(' · ');
  return `${s.origin === 'ADMIN' ? 'Admin — ' : ''}${m.name}${detail ? ` (${detail})` : ''}`;
}

export function serviceStatusText(s: DoctorServiceDto): string {
  if (s.doneAt) return 'Done';
  return s.status === 'APPROVED' ? 'Approved, to do' : s.status.replace(/_/g, ' ').toLowerCase();
}

/** One doctor service in full: the remarks unabridged, who made it, and where it stands. */
export function ServiceDetailDialog({
  service,
  madeBy,
  canMarkDone,
  marking,
  onMarkDone,
  onClose,
}: {
  service: DoctorServiceDto;
  madeBy: string;
  canMarkDone: boolean;
  marking: boolean;
  onMarkDone: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Doctor service"
      description={`${serviceTypeLabel(service.serviceType)} for ${service.doctorName || 'a doctor'}`}
      footer={
        <>
          {canMarkDone ? (
            <Button disabled={marking} onClick={onMarkDone}>
              Mark done
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="px-6 py-4">
        <FieldList>
          <Field label="Doctor">
            <Link href={`/doctors/${service.doctorId}`} className="text-accent hover:underline">
              {service.doctorName || 'Open the doctor'}
            </Link>
          </Field>
          <Field label="Service">{serviceTypeLabel(service.serviceType)}</Field>
          <Field label="Amount">{formatMoney(service.amountPaise)}</Field>
          <Field label="Made by">{madeBy}</Field>
          <Field label="Status">{serviceStatusText(service)}</Field>
          <Field label="Date">{formatDate(service.createdAt)}</Field>
          {service.doneAt ? <Field label="Carried out">{formatDate(service.doneAt)}</Field> : null}
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Remarks">
              <span className="whitespace-pre-wrap break-words">{service.remarks}</span>
            </Field>
          </div>
        </FieldList>
      </div>
    </Dialog>
  );
}
