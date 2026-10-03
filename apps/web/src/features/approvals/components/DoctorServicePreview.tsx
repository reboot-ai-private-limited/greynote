'use client';

import Link from 'next/link';
import { Field, FieldList } from '@/components/ui/FieldList';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { formatDate, formatMoney } from '@/lib/format';
import { useDoctorService } from '../hooks/usePreviews';
import { serviceOriginLabel, serviceTypeLabel } from '../lib/previews';
import { PreviewFrame } from './PreviewFrame';

/** A service for a doctor (a tour, a gift, a promotion): what it is, what it costs, and who it is tied to. */
export function DoctorServicePreview({ recordId }: { recordId: string }) {
  const query = useDoctorService(recordId);
  const service = query.data;
  return (
    <PreviewFrame title="Doctor service" description="Check what is being offered to the doctor, and its cost." query={query}>
      {service ? (
        <div className="p-5">
          <FieldList>
            <Field label="Doctor">
              <Link href={`/doctors/${service.doctorId}`} className="text-accent hover:underline">
                {service.doctorName || 'Open the doctor'}
              </Link>
            </Field>
            <Field label="Service">{serviceTypeLabel(service.serviceType)}</Field>
            <Field label="Amount">{formatMoney(service.amountPaise)}</Field>
            <Field label="Tied to">
              <EmployeeName userId={service.userId} />
            </Field>
            <Field label="Made by">{serviceOriginLabel(service.origin)}</Field>
            <Field label="Created">{formatDate(service.createdAt)}</Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Remarks">{service.remarks}</Field>
            </div>
          </FieldList>
        </div>
      ) : null}
    </PreviewFrame>
  );
}
