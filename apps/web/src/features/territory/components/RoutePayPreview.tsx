'use client';

import type { RouteType } from '@greynote/contracts';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePayBands } from '@/features/people/hooks/useMasterData';
import { formatMoney } from '@/lib/format';
import { rupeesToPaise } from '@/lib/money';
import { useStationThresholds } from '../hooks/useStationThresholds';
import { useTaMaxKm } from '../hooks/useTaMaxKm';
import { AUTO_ROUTE_TYPE, ROUTE_TYPE_LABEL } from '../lib/draft';
import { routePayPreview, type RoutePayRow } from '../lib/routePay';
import { suggestedType } from '../lib/routeDraft';

const km = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} km`;

/** "What this route pays": the TA / DA the form's km, type and rate give each pay grade, worked out live as the form is filled in. */
export function RoutePayPreview({
  distanceKm,
  type,
  rate,
}: {
  distanceKm: string;
  type: string;
  rate: string;
}) {
  const grades = usePayBands();
  const capKm = useTaMaxKm();
  const thresholds = useStationThresholds();
  const effectiveType: RouteType | null =
    type === AUTO_ROUTE_TYPE ? suggestedType(distanceKm, thresholds) : (type as RouteType);
  const overridePaise = rate.trim() === '' ? null : rupeesToPaise(rate);
  const preview = routePayPreview({
    distanceKm,
    type: effectiveType,
    overridePaise,
    capKm,
    grades: grades.data ?? [],
  });

  const columns: readonly Column<RoutePayRow>[] = [
    {
      key: 'grade',
      header: 'Grade',
      render: (r) => <span className="font-medium">{r.gradeName}</span>,
    },
    {
      key: 'km',
      header: 'Km paid',
      numeric: true,
      render: () => (preview.paidKm === null ? '—' : preview.noTa ? '0 km' : km(preview.paidKm)),
    },
    {
      key: 'rate',
      header: 'TA / km',
      numeric: true,
      render: (r) => `${formatMoney(r.taRatePaise)}${r.overridden ? ' *' : ''}`,
    },
    { key: 'ta', header: 'TA', numeric: true, render: (r) => formatMoney(r.taPaise) },
    {
      key: 'da',
      header: 'DA',
      numeric: true,
      render: (r) => (r.daPaise === null ? '—' : formatMoney(r.daPaise)),
    },
    {
      key: 'total',
      header: 'Day total',
      numeric: true,
      render: (r) => (
        <span className="font-medium">
          {r.totalPaise === null ? '—' : formatMoney(r.totalPaise)}
        </span>
      ),
    },
  ];

  return (
    <Card
      title="What this route pays"
      description="Worked out live from the distance, type and rate you enter."
    >
      <div className="space-y-4 p-5 text-sm">
        <div className="rounded-md bg-surface-subtle px-3 py-2.5">
          <p className="font-medium text-text">
            TA = min(distance, {capKm === null ? 'TA cap' : km(capKm)}) × rate per km
          </p>
          <p className="mt-1 text-[13px] text-text-muted">
            {preview.paidKm === null
              ? 'Enter the distance to see the amounts.'
              : preview.noTa
                ? 'An HQ route earns no TA, only DA.'
                : `${km(preview.paidKm)} are paid, one way — the distance is never doubled.`}
          </p>
          {preview.capped && !preview.noTa && preview.capKm !== null ? (
            <p role="status" className="mt-1 text-[13px] text-warning-fg">
              Over the {km(preview.capKm)} cap: only {km(preview.capKm)} are paid, the rest is not.
            </p>
          ) : null}
        </div>
        <p className="text-[13px] text-text-muted">
          {overridePaise !== null
            ? `Your rate of ${formatMoney(overridePaise)} per km (*) replaces every grade's own TA rate.`
            : "No rate set here, so each grade's own TA rate is used."}
          {effectiveType ? ` DA is for a ${ROUTE_TYPE_LABEL[effectiveType]} day.` : ''}
        </p>
        {grades.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : preview.rows.length === 0 ? (
          <p className="text-text-muted">
            No pay grades yet.{' '}
            <Link href="/pay-grades" className="text-accent hover:underline">
              Add grades
            </Link>{' '}
            to see the amounts.
          </p>
        ) : (
          <DataTable
            columns={columns}
            rows={preview.rows}
            rowKey={(r) => r.gradeId}
            bleed={false}
          />
        )}
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-text-muted">
          <li>If the MR is paid for the way back too, enter the full there-and-back distance.</li>
          <li>When a day has several routes, only the longest one (not an HQ route) is paid TA.</li>
          <li>A day&apos;s DA follows the highest route type of that day.</li>
        </ul>
        <p className="text-[13px]">
          <Link href="/pay-grades" className="text-accent hover:underline">
            Edit pay grades
          </Link>
        </p>
      </div>
    </Card>
  );
}
