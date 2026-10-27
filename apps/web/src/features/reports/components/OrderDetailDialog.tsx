'use client';

import type { ReportOrderItemDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useOrderDetail } from '../hooks/useOrders';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '../lib/orders';
import { EditOrderDialog } from './OrderFormDialog';

const discountText = (d: NonNullable<ReportOrderItemDto['discount']>) => (d.type === 'PERCENT' ? `${d.percent}% off` : `${formatMoney(d.amountPaise)} off`);

/** A Done line for the units that arrived: its net, scaled by supplied ÷ ordered. */
const suppliedNetOf = (i: ReportOrderItemDto) => ((i.suppliedQty ?? i.quantity) >= i.quantity ? i.netAmountPaise : Math.round((i.netAmountPaise * (i.suppliedQty ?? i.quantity)) / i.quantity));

/** One order in full: who, where, when, and each product with its quantity, price and amount. */
export function OrderDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useOrderDetail(id);
  const o = query.data;
  const [editing, setEditing] = useState(false);
  const hasFree = (o?.items ?? []).some((i) => i.freeQty > 0);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Order" description={o ? `${o.outlet.name} · ${formatDate(o.orderDate)}` : undefined}>
      {query.isLoading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : query.error || !o ? (
        <p role="alert" className="text-sm text-danger-fg">
          {query.error ? toErrorState(query.error).message : 'Order not found.'}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
            <span className="text-sm text-text-muted">
              {o.outletType === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist'} · placed by {o.mr.name} ({o.mr.employeeCode})
            </span>
          </div>
          {o.completedAt ? (
            <p className="text-sm text-text-muted">
              {o.status === 'DONE' ? 'Marked Done' : 'Cancelled'} {formatDateTime(o.completedAt)}
              {o.completedBy ? ` by ${o.completedBy.name}` : ''}.
              {o.invoiceNumber ? ` Invoice no. ${o.invoiceNumber}.` : ''}
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Product
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {o.status === 'DONE' ? 'Ordered' : 'Qty'}
                  </th>
                  {o.status === 'DONE' ? (
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Supplied
                    </th>
                  ) : null}
                  {o.status === 'DONE' || hasFree ? (
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Free
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Price
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((item, at) => (
                  <tr key={at} className="border-t border-border">
                    <td className="px-3 py-2">
                      {item.productName} <span className="text-xs text-text-subtle">{item.sku}</span>
                      {item.discount ? <span className="ml-1 text-xs text-success-fg">{discountText(item.discount)}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    {o.status === 'DONE' ? <td className="px-3 py-2 text-right tabular-nums">{item.suppliedQty ?? item.quantity}</td> : null}
                    {o.status === 'DONE' || hasFree ? <td className="px-3 py-2 text-right tabular-nums">{item.freeQty}</td> : null}
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.unitPricePaise)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(o.status === 'DONE' ? suppliedNetOf(item) : item.netAmountPaise)}</td>
                  </tr>
                ))}
                {o.discount ? (
                  <tr className="border-t border-border text-text-muted">
                    <td className="px-3 py-2" colSpan={o.status === 'DONE' ? 5 : hasFree ? 4 : 3}>
                      Order discount ({discountText(o.discount)}), already in the amounts above
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">− {formatMoney(o.orderDiscountPaise)}</td>
                  </tr>
                ) : null}
                <tr className="border-t border-border font-medium">
                  <td className="px-3 py-2" colSpan={o.status === 'DONE' ? 5 : hasFree ? 4 : 3}>
                    {o.status === 'DONE' ? 'Delivered' : 'Total'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(o.status === 'DONE' ? (o.suppliedAmountPaise ?? o.totalAmountPaise) : o.totalAmountPaise)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {o.original ? (
            <div className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-text-muted">
              <p className="font-medium text-text">Originally ordered by the employee</p>
              <ul className="mt-1 space-y-0.5">
                {o.original.map((l, at) => (
                  <li key={at}>
                    {l.productName}: {l.quantity} × {formatMoney(l.unitPricePaise)}
                  </li>
                ))}
              </ul>
              {o.originalTotalAmountPaise !== null ? <p className="mt-1">Total {formatMoney(o.originalTotalAmountPaise)}</p> : null}
            </div>
          ) : null}
          {o.status === 'DONE' && o.suppliedAmountPaise !== null && o.suppliedAmountPaise !== o.totalAmountPaise ? (
            <p className="text-sm text-text-muted">
              Ordered {formatMoney(o.totalAmountPaise)}; {formatMoney(o.suppliedAmountPaise)} was delivered. Free units are not charged.
            </p>
          ) : null}
          {o.remarks ? <p className="text-sm text-text-muted">Remarks: {o.remarks}</p> : null}
          {o.status === 'PLACED' ? (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Change order
              </Button>
            </div>
          ) : null}
          {editing ? <EditOrderDialog order={o} onClose={() => setEditing(false)} /> : null}
        </div>
      )}
    </Dialog>
  );
}
