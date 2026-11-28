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
  fixed = '',
  title = 'What this route pays',
}: {
  distanceKm: string;
  /** A route type, or Automatic (the km's). A route between places passes its type, worked out from the places. */
  type: string;
  rate: string;
  /** A fixed TA for the day, in rupees ('' = none). */
  fixed?: string;
  /** E.g. "What a day in SILIGURI pays" for the HQ town (no route: 0 km, HQ type). */
  title?: string;
}) {
  const grades = usePayBands();
  const capKm = useTaMaxKm();
  const thresholds = useStationThresholds();
  const effectiveType: RouteType | null =
    type === AUTO_ROUTE_TYPE ? suggestedType(distanceKm, thresholds) : (type as RouteType);
  const overridePaise = rate.trim() === '' ? null : rupeesToPaise(rate);
  const fixedPaise = fixed.trim() === '' ? null : rupeesToPaise(fixed);
  const preview = routePayPreview({
    distanceKm,
    type: effectiveType,
    overridePaise,
    fixedPaise,
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
      render: () => (preview.noTa ? '0 km' : preview.paidKm === null ? '—' : km(preview.paidKm)),
    },
    {
      key: 'rate',
      header: 'TA / km',
      numeric: true,
      render: (r) => (fixedPaise !== null ? 'Fixed *' : `${formatMoney(r.taRatePaise)}${r.overridden ? ' *' : ''}`),
    },
    { key: 'ta', header: 'TA one way', numeric: true, render: (r) => formatMoney(r.taPaise) },
    { key: 'trip', header: 'TA day trip', numeric: true, render: (r) => formatMoney(r.dayTripTaPaise) },
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
      title={title}
      description="Worked out live from the distance, type and rate you enter."
    >
      <div className="space-y-4 p-5 text-sm">
        <div className="rounded-md bg-surface-subtle px-3 py-2.5">
          <p className="font-medium text-text">
            TA = min(distance, {capKm === null ? 'TA cap' : km(capKm)}) × rate per km
          </p>
          <p className="mt-1 text-[13px] text-text-muted">
            {preview.noTa
              ? 'An HQ place earns no TA, only DA.'
              : preview.paidKm === null
                ? 'Enter the distance to see the amounts.'
                : `${km(preview.paidKm)} are paid one way; a day trip (home the same night) pays them there and back.`}
          </p>
          {preview.capped && !preview.noTa && preview.capKm !== null ? (
            <p role="status" className="mt-1 text-[13px] text-warning-fg">
              Over the {km(preview.capKm)} cap: only {km(preview.capKm)} are paid, the rest is not.
            </p>
          ) : null}
        </div>
        <p className="text-[13px] text-text-muted">
          {fixedPaise !== null
            ? fixedPaise === 0
              ? 'No TA is paid for a day here (fixed ₹0), for every grade. DA is paid as usual.'
              : `A fixed TA of ${formatMoney(fixedPaise)} (*) is paid for the day, for every grade, whatever the km.`
            : overridePaise !== null
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
          <li>Enter the km one way. A day trip doubles it; going away, moving on and coming back each pay it once.</li>
          <li>DA follows where the person is against their own HQ: out-station while away (anywhere outside their HQ, or an out-station place of it), ex-station on the day back.</li>
          <li>The DA column is for someone of this route&apos;s HQ on a day trip there.</li>
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
