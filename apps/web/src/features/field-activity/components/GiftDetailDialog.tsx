'use client';

import type { DoctorGiftDto } from '@greynote/contracts';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FieldList } from '@/components/ui/FieldList';
import { formatDate, formatMoney } from '@/lib/format';

const STATUS_LABEL = { REQUESTED: 'Requested', PENDING: 'To give', DONE: 'Done', REJECTED: 'Rejected' } as const;

/** "Rahul Das (EMP-102 · Sr. MR)", "Admin — Name (…)" for an allocation; the old wording when the server did not name the person. */
export function giftMadeByLabel(g: DoctorGiftDto, designationName: (id: string | null) => string): string {
  const m = g.madeBy;
  if (!m) return g.origin === 'EMPLOYEE' ? `Asked by ${g.requestedByName ?? 'an employee'}` : 'Allocated by Admin';
  const detail = [m.employeeCode, designationName(m.designationId)].filter(Boolean).join(' · ');
  return `${g.origin === 'EMPLOYEE' ? 'Asked by ' : 'Admin — '}${m.name}${detail ? ` (${detail})` : ''}`;
}

/** One gift in full: the note and any rejection reason unabridged, who made it, and where it stands. */
export function GiftDetailDialog({ gift, madeBy, onClose }: { gift: DoctorGiftDto; madeBy: string; onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Doctor gift"
      description={`${gift.productName} for ${gift.doctorName || 'a doctor'}`}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="px-6 py-4">
        <FieldList>
          <Field label="Doctor">
            <Link href={`/doctors/${gift.doctorId}`} className="text-accent hover:underline">
              {gift.doctorName || 'Open the doctor'}
            </Link>
          </Field>
          <Field label="Gift">{gift.productName}</Field>
          <Field label="Value">{gift.status === 'REQUESTED' ? (gift.amountPaise > 0 ? `${formatMoney(gift.amountPaise)} asked` : '') : formatMoney(gift.amountPaise)}</Field>
          <Field label="Made by">{madeBy}</Field>
          <Field label="Status">{STATUS_LABEL[gift.status]}</Field>
          <Field label="Allocated">{formatDate(gift.allocatedAt)}</Field>
          {gift.completedAt ? <Field label="Delivered">{formatDate(gift.completedAt)}</Field> : null}
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Request note">
              <span className="whitespace-pre-wrap break-words">{gift.requestNote}</span>
            </Field>
          </div>
          {gift.rejectReason ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Rejected because">
                <span className="whitespace-pre-wrap break-words">{gift.rejectReason}</span>
              </Field>
            </div>
          ) : null}
        </FieldList>
      </div>
    </Dialog>
  );
}
