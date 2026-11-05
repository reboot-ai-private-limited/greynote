'use client';

import type { SecondaryStockMonthDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { formatMoney } from '@/lib/format';
import { useEditSecondaryStock } from '@/features/reports/hooks/useEmployeeSales';

type Figures = { openingQty: string; primaryQty: string; issuedQty: string };
const key = (distributorId: string, productId: string) => `${distributorId}|${productId}`;
const whole = (s: string): number | null => (/^\d{1,9}$/.test(s) ? Number(s) : null);

/**
 * The manager above an MR (or Admin) corrects the figures the MR sent, before approving. Only the lines the MR saved can be changed; closing is
 * recalculated, never typed, and a reason is required. Only the lines that differ are sent.
 */
export function EditSecondaryStockDialog({ data, onClose }: { data: SecondaryStockMonthDto; onClose: () => void }) {
  const rows = data.distributors.flatMap((d) => d.lines.filter((l) => l.saved).map((l) => ({ d, l })));
  const [figures, setFigures] = useState<Record<string, Figures>>(() => Object.fromEntries(rows.map(({ d, l }) => [key(d.distributorId, l.product.id), { openingQty: String(l.openingQty), primaryQty: String(l.primaryQty), issuedQty: String(l.issuedQty) }])));
  const [reason, setReason] = useState('');
  const save = useEditSecondaryStock(onClose);

  const parsed = rows.map(({ d, l }) => {
    const f = figures[key(d.distributorId, l.product.id)]!;
    const n = { openingQty: whole(f.openingQty), primaryQty: whole(f.primaryQty), issuedQty: whole(f.issuedQty) };
    const valid = n.openingQty !== null && n.primaryQty !== null && n.issuedQty !== null;
    const closing = valid ? n.openingQty! + n.primaryQty! - n.issuedQty! : null;
    const changed = valid && (n.openingQty !== l.openingQty || n.primaryQty !== l.primaryQty || n.issuedQty !== l.issuedQty);
    return { d, l, n, valid, closing, changed };
  });
  const allValid = parsed.every((p) => p.valid && p.closing! >= 0);
  const changes = parsed.filter((p) => p.changed);
  const canSave = allValid && changes.length > 0 && reason.trim().length >= 3;
  const set = (d: string, p: string, field: keyof Figures, v: string) => setFigures((s) => ({ ...s, [key(d, p)]: { ...s[key(d, p)]!, [field]: v } }));

  return (
    <FormDialog
      title="Correct secondary figures"
      description="You are changing what the MR entered. The MR's original figures stay on record and are shown on the line."
      formId="edit-secondary-stock"
      pending={save.isPending}
      disabled={!canSave}
      onClose={onClose}
      wide
      onSubmit={() =>
        save.mutate({
          userId: data.userId,
          month: data.month,
          reason: reason.trim(),
          lines: changes.map((p) => ({ distributorId: p.d.distributorId, productId: p.l.product.id, openingQty: p.n.openingQty!, primaryQty: p.n.primaryQty!, issuedQty: p.n.issuedQty! })),
        })
      }
    >
      <div className="space-y-4">
        <div className="max-h-[50vh] space-y-3 overflow-auto">
          {data.distributors
            .filter((d) => d.lines.some((l) => l.saved))
            .map((d) => (
              <div key={d.distributorId} className="space-y-1.5">
                <h3 className="text-[13px] font-semibold text-text">{d.name}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted">
                      <th className="py-1 pr-2 font-medium">Product</th>
                      <th className="px-1 font-medium">Opening</th>
                      <th className="px-1 font-medium">Primary</th>
                      <th className="px-1 font-medium">Secondary</th>
                      <th className="px-1 text-right font-medium">Closing</th>
                      <th className="pl-2 text-right font-medium">Secondary at PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed
                      .filter((p) => p.d.distributorId === d.distributorId)
                      .map(({ l, closing, n, valid }) => {
                        const f = figures[key(d.distributorId, l.product.id)]!;
                        const bad = (v: string) => whole(v) === null;
                        return (
                          <tr key={l.product.id} className="border-t border-border">
                            <td className="py-1 pr-2 font-medium">{l.product.name}</td>
                            {(['openingQty', 'primaryQty', 'issuedQty'] as const).map((field) => (
                              <td key={field} className="px-1 py-1">
                                <Input
                                  inputMode="numeric"
                                  aria-label={`${l.product.name} ${field.replace('Qty', '')}`}
                                  aria-invalid={bad(f[field])}
                                  className="h-8 w-20 px-2 text-right"
                                  value={f[field]}
                                  onChange={(e) => set(d.distributorId, l.product.id, field, e.target.value)}
                                />
                              </td>
                            ))}
                            <td className={`px-1 text-right ${closing !== null && closing < 0 ? 'font-semibold text-danger-fg' : ''}`}>{closing ?? '—'}</td>
                            <td className="pl-2 text-right text-text-muted">{valid && l.ptsPaise ? formatMoney(n.issuedQty! * l.ptsPaise) : '—'}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ))}
        </div>
        {parsed.some((p) => p.closing !== null && p.closing < 0) ? <p role="alert" className="text-[13px] text-danger-fg">Secondary cannot be more than opening plus primary.</p> : null}
        <FormField label="Why are you changing it?" htmlFor="edit-secondary-reason" hint="Required. The MR and the approver see this next to the line.">
          <Textarea id="edit-secondary-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>
    </FormDialog>
  );
}
