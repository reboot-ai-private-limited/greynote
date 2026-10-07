'use client';

import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useOrderDetail } from '../hooks/useOrders';
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from '../lib/orders';

/** One order in full: who, where, when, and each product with its quantity, price and amount. */
export function OrderDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useOrderDetail(id);
  const o = query.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Order" description={o ? `${o.outlet.name} · ${formatDate(o.orderDate)}` : undefined}>
      {query.isLoading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : query.error || !o ? (
        <p role="alert" className="text-sm text-danger-fg">{query.error ? toErrorState(query.error).message : 'Order not found.'}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
            <span className="text-sm text-text-muted">{o.outletType === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist'} · placed by {o.mr.name} ({o.mr.employeeCode})</span>
          </div>
          {o.completedAt ? (
            <p className="text-sm text-text-muted">
              {o.status === 'DONE' ? 'Marked Done' : 'Cancelled'} {formatDateTime(o.completedAt)}
              {o.completedBy ? ` by ${o.completedBy.name}` : ''}.
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-subtle text-xs uppercase tracking-wide text-text-subtle">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Product</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((item) => (
                  <tr key={item.productId} className="border-t border-border">
                    <td className="px-3 py-2">
                      {item.productName} <span className="text-xs text-text-subtle">{item.sku}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.unitPricePaise)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.amountPaise)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-medium">
                  <td className="px-3 py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(o.totalAmountPaise)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {o.remarks ? <p className="text-sm text-text-muted">Remarks: {o.remarks}</p> : null}
        </div>
      )}
    </Dialog>
  );
}
