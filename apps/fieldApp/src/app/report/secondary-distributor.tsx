import { useLocalSearchParams } from 'expo-router';

import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { ReportList, ReportRow } from '@/components/report-kit';
import { ScreenShell } from '@/components/screen-shell';
import { Pill, InfoCard } from '@/components/ui-cards';
import { ThemedText } from '@/components/themed-text';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { useSessionUser } from '@/lib/session';
import { getStockCounts, STOCK_COUNT_STATUS_ACCENT, STOCK_COUNT_STATUS_TEXT, type StockCountsMonth } from '@/lib/stock-counts';
import { rupees } from '@/lib/xlsx';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyMonth } from '@/offline/day';

/**
 * One distributor's secondary for a month, product by product (2026-11-28, Reports → Secondary sales → a distributor): view only,
 * Opening · Primary · Secondary · Closing and the value at PTS, with that distributor's totals and an Excel of these rows.
 */
export default function SecondaryDistributorScreen() {
  // `userId`: a team member's (2026-11-28, opened from their page); otherwise your own.
  const { month, distributorId, userId } = useLocalSearchParams<{ month: string; distributorId: string; userId?: string }>();
  const me = useSessionUser();
  const fy = useFinancialYear();
  // The same read (and saved copy) as the Secondary sales report it was opened from.
  const whose = userId || me?.id || '';
  const counts = useCachedFetch<StockCountsMonth>(userId ? `secondary-stock:${fy.year}:${userId}:${month}` : `rep-secondary:${fy.year}:${month}`, () => getStockCounts(whose, month));
  const d = counts.data?.distributors.find((x) => x.distributorId === distributorId) ?? null;
  const rows = (d?.lines ?? []).filter((l) => l.openingQty > 0 || l.primaryQty > 0 || l.issuedQty > 0).sort((a, b) => b.issuedQty - a.issuedQty || a.product.name.localeCompare(b.product.name));
  const value = (paise: number | null, units: number) => (paise === null ? null : units * paise);

  return (
    <ScreenShell title={d?.name ?? 'Distributor'} subtitle={`Secondary sales · ${prettyMonth(month)}`}>
      <FyBanner />
      {d ? (
        <InfoCard>
          <ThemedText type="smallBold">{`${rows.length} product${rows.length === 1 ? '' : 's'} · ${d.totals.issuedQty} units · ${formatRupees(d.totals.issuedAmountPaise)}`}</ThemedText>
          <Pill text={STOCK_COUNT_STATUS_TEXT[d.status]} accent={STOCK_COUNT_STATUS_ACCENT[d.status]} />
        </InfoCard>
      ) : counts.data ? (
        <Notice tone="info">This distributor has no secondary this month.</Notice>
      ) : null}
      <ReportList
        title="Products"
        rows={rows}
        state={counts}
        hasData={counts.data !== null}
        tiles={d ? [{ label: 'Opening', value: d.totals.openingQty, accent: 'slate' }, { label: 'Secondary', value: d.totals.issuedQty, accent: 'green' }, { label: 'Closing', value: d.totals.closingQty, accent: 'blue' }] : undefined}
        empty="No product entered for this distributor."
        render={(l) => (
          <ReportRow
            key={l.product.id}
            title={l.product.name}
            subtitle={`Opening ${l.openingQty} · Primary ${l.primaryQty} · Secondary ${l.issuedQty} · Closing ${l.closingQty}`}
            value={l.ptsPaise === null ? 'no PTS' : formatRupees(value(l.ptsPaise, l.issuedQty) ?? 0)}
          />
        )}
        fileName={`GREYNOTE SECONDARY ${month} ${(d?.name ?? 'DISTRIBUTOR').replace(/[^\w .-]/g, '').trim()}.xlsx`}
        sheet={() => ({
          sheet: `Secondary ${month}`,
          title: `${me?.name ?? ''} · ${d?.name ?? ''} · Secondary sales · ${prettyMonth(month)}`,
          header: ['Product', 'SKU', 'Opening', 'Primary', 'Secondary', 'Closing', 'PTS (₹)', 'Value (₹)'],
          rows: rows.map((l) => [l.product.name, l.product.sku, l.openingQty, l.primaryQty, l.issuedQty, l.closingQty, l.ptsPaise === null ? null : rupees(l.ptsPaise), l.ptsPaise === null ? null : rupees(l.issuedQty * l.ptsPaise)]),
          totals: d ? ['Total', '', d.totals.openingQty, d.totals.primaryQty, d.totals.issuedQty, d.totals.closingQty, null, rupees(d.totals.issuedAmountPaise)] : undefined,
        })}
      />
    </ScreenShell>
  );
}
