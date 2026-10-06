'use client';

import type { PromotionStatus } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { toast } from '@/components/ui/toast';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAllPromotions, useApplyDuePromotions } from '../hooks/usePromotions';
import { PromotionCard } from './PromotionCard';

const ALL = 'all';
const FILTERS = [
  { value: ALL, label: 'All promotions' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

/**
 * Every promotion in the org. What needs attention comes first: a scheduled one with someone not in its plan, an applied one that left a
 * person unplaced, or one that could not be applied. The server applies due promotions every hour; the button does it now.
 */
export function PromotionsScreen() {
  const readOnly = useIsReadOnly();
  const [status, setStatus] = useState<PromotionStatus | ''>('');
  const query = useAllPromotions(status);
  const apply = useApplyDuePromotions((r) =>
    r.failed > 0 ? toast.error(`${r.applied} applied, ${r.failed} could not be applied — see the notes below.`) : toast.success(r.applied === 0 ? 'Nothing was due.' : `${r.applied} promotion${r.applied === 1 ? '' : 's'} applied.`),
  );
  const rows = query.data ?? [];
  const attention = rows.filter((p) => p.attention.length > 0);
  const rest = rows.filter((p) => p.attention.length === 0);

  return (
    <>
      <PageHeader
        title="Promotions"
        description="Scheduled and past promotions. They apply by themselves on the 1st of their month; the server checks every hour."
        actions={
          <Button variant="secondary" disabled={readOnly || apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? 'Applying…' : 'Apply due promotions now'}
          </Button>
        }
      />
      <div className="mb-4 w-56">
        <Select
          aria-label="Show"
          value={status || ALL}
          onValueChange={(v) => setStatus(v === ALL ? '' : (v as PromotionStatus))}
          options={FILTERS}
        />
      </div>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={rows.length === 0}
        empty={{ title: 'No promotions', description: 'Promote someone from their employee page.' }}
      >
        <div className="space-y-6">
          {attention.length > 0 ? (
            <Card title="Needs attention" description="Someone is not placed, or a step did not go as planned. These clear by themselves once fixed.">
              <div className="space-y-3 p-5">
                {attention.map((p) => (
                  <PromotionCard key={p.id} promotion={p} showEmployee canCancel={!readOnly} />
                ))}
              </div>
            </Card>
          ) : null}
          <div className="space-y-3">
            {rest.map((p) => (
              <PromotionCard key={p.id} promotion={p} showEmployee canCancel={!readOnly} />
            ))}
          </div>
        </div>
      </DataState>
    </>
  );
}
