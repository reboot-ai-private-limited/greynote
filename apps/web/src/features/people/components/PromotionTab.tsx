'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Button } from '@/components/ui/Button';
import { toErrorState } from '@/lib/api/toErrorState';
import { usePromotionsOf } from '../hooks/usePromotions';
import { PromotionCard } from './PromotionCard';

/** An employee's promotions, newest first, and the way to schedule another. */
export function PromotionTab({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const router = useRouter();
  const query = usePromotionsOf(user.id);
  const canPromote = !readOnly && user.status !== 'inactive';
  return (
    <Card
      title="Promotion"
      description="A change of designation, grade or manager takes effect on the 1st of a month; the team is handed over in the same step."
      actions={
        canPromote ? (
          <Button size="sm" onClick={() => router.push(`/employees/${user.id}/promote`)}>
            Promote
          </Button>
        ) : null
      }
    >
      <div className="space-y-3 p-5">
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={query.data?.length === 0}
          empty={{ title: 'No promotions yet', description: 'When this employee is promoted, it shows here with its date and what changed.' }}
        >
          {(query.data ?? []).map((p) => (
            <PromotionCard key={p.id} promotion={p} canCancel={!readOnly} />
          ))}
        </DataState>
      </div>
    </Card>
  );
}
