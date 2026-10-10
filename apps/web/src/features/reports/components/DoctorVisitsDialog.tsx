'use client';

import type { DoctorVisitMrDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { monthLabel } from '@/features/payroll/lib/payroll';

type Row = DoctorVisitMrDto['rows'][number];

const columns: readonly Column<Row>[] = [
  {
    key: 'doctor',
    header: 'Doctor',
    render: (r) => <span className="font-medium">{r.doctor.name}</span>,
  },
  { key: 'specialty', header: 'Speciality', render: (r) => r.doctor.specialty },
  { key: 'frequency', header: 'Should visit', numeric: true, render: (r) => r.frequency },
  { key: 'made', header: 'Called', numeric: true, render: (r) => r.made },
  {
    key: 'missed',
    header: 'Missed',
    numeric: true,
    render: (r) =>
      r.missed > 0 ? (
        <Badge tone="warning">{`${r.missed} missed`}</Badge>
      ) : (
        <Badge tone="success">Done</Badge>
      ),
  },
];

/** One employee's doctors against their visit frequency for a month, most missed first. */
export function DoctorVisitsDialog({
  row,
  month,
  onClose,
}: {
  row: DoctorVisitMrDto;
  month: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${row.mr.name} · doctor visits`}
      description={`${row.mr.employeeCode} · ${monthLabel(month)} · ${row.made} of ${row.quota} visits made`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <DataTable columns={columns} rows={row.rows} rowKey={(r) => r.doctor.id} />
    </Dialog>
  );
}
