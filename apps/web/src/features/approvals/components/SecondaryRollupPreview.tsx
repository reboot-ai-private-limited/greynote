'use client';

import type { SecondaryReportDistributorDto, SecondaryRollupDto } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { formatMoney } from '@/lib/format';
import { useSecondaryRollup } from '../hooks/usePreviews';
import { PreviewFrame } from './PreviewFrame';

const money = (p: number | null): string => (p === null ? '—' : formatMoney(p));

function Distributor({ d }: { d: SecondaryReportDistributorDto }) {
  return (
    <div className="space-y-1.5 overflow-x-auto">
      <h3 className="text-[13px] font-semibold text-text">{d.name}</h3>
      <table className="w-full min-w-[34rem] text-[13px]">
        <thead>
          <tr className="text-left text-text-muted">
            <th className="px-3 py-1.5 font-medium">Product</th>
            <th className="px-3 py-1.5 text-right font-medium">Opening</th>
            <th className="px-3 py-1.5 text-right font-medium">Primary</th>
            <th className="px-3 py-1.5 text-right font-medium">Secondary</th>
            <th className="px-3 py-1.5 text-right font-medium">Closing</th>
            <th className="px-3 py-1.5 text-right font-medium">Value at PTS</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.product.id} className="border-t border-border">
              <td className="px-3 py-1.5 font-medium">{l.product.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.openingQty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.primaryQty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.issuedQty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{l.closingQty}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(l.issuedAmountPaise)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-border font-semibold">
            <td className="px-3 py-1.5">Total</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{d.totals.openingQty}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{d.totals.primaryQty}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{d.totals.issuedQty}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{d.totals.closingQty}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{money(d.totals.issuedAmountPaise)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const sourceTone = (status: string) => (status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'danger' : 'warning');

/**
 * A manager's month of team secondary sales: the sum of the approved MR reports below them, read-only. Approving it saves it as the manager's
 * personal achievement for the month, with their designation then and a reference to each MR report it rests on.
 */
function Body({ data }: { data: SecondaryRollupDto }) {
  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <EmployeeName userId={data.userId} /> · {monthLabel(data.month)}
        {data.designation?.name ? <Badge tone="accent">{data.designation.name}</Badge> : null}
        <Badge tone="neutral">{data.approvedMrCount} of {data.mrCount} MR reports approved</Badge>
      </div>
      {data.outOfDate ? (
        <p role="alert" className="rounded-md bg-warning-bg px-3 py-2 text-sm font-medium text-warning-fg">
          An MR report has been approved, reopened or approved again since this was sent, so it is out of date. Reject it so the manager can send it again.
        </p>
      ) : null}
      {data.distributors.map((d) => (
        <Distributor key={d.distributorId} d={d} />
      ))}
      <p className="text-[13px] text-text-muted">
        Total: opening <b>{data.totals.openingQty}</b> · primary <b>{data.totals.primaryQty}</b> · secondary <b>{data.totals.issuedQty}</b> · closing <b>{data.totals.closingQty}</b> · secondary value <b>{formatMoney(data.totals.issuedAmountPaise)}</b>
      </p>
      <div className="space-y-1.5">
        <h3 className="text-[13px] font-semibold text-text">MR reports this is built from</h3>
        <ul className="divide-y divide-border rounded-md border border-border text-[13px]">
          {data.sources.map((s) => (
            <li key={s.recordId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                {s.requestId ? (
                  <Link href={`/approvals/${s.requestId}`} className="font-medium text-accent hover:underline">{s.name}</Link>
                ) : (
                  <span className="font-medium">{s.name}</span>
                )}{' '}
                <span className="text-text-subtle">{s.employeeCode}</span>
              </span>
              <span className="flex items-center gap-3">
                {s.status === 'APPROVED' ? <span className="tabular-nums text-text-muted">secondary {s.issuedQty}</span> : null}
                <Badge tone={sourceTone(s.status)}>{s.status === 'NOT_SUBMITTED' ? 'Not submitted' : s.status.replace('_', ' ').toLowerCase()}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SecondaryRollupPreview({ recordId }: { recordId: string }) {
  const [userId = '', month = ''] = recordId.split(':');
  const query = useSecondaryRollup(userId, month);
  return (
    <PreviewFrame title="Team secondary report" description="The approved MR reports below this manager, added up once. Approving it saves it as their achievement for the month." query={query}>
      {query.data ? <Body data={query.data} /> : null}
    </PreviewFrame>
  );
}
