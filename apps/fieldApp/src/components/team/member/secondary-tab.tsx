import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { downloadSecondarySheet } from '@/lib/secondary-sheet';
import { getStockCounts, STOCK_COUNT_STATUS_ACCENT, STOCK_COUNT_STATUS_TEXT, type StockCountsMonth } from '@/lib/stock-counts';
import { useCachedFetch } from '@/offline/cached-fetch';

import { PrimaryButton } from '../../primary-button';
import { ReportList, ReportRow } from '../../report-kit';
import { ProofFiles } from '../../stock-counts-card';
import { ThemedText } from '../../themed-text';

/**
 * A team member's secondary for the month (2026-11-28), like your own Secondary sales report: tiles, one row a distributor, a tap opens that
 * distributor product by product, then the proof files. The Excel is their Secondary sales sheet for the year, the one Admin downloads.
 */
export function SecondaryTab({ userId, month, personName }: { userId: string; month: string; personName: string }) {
  const fy = useFinancialYear();
  const counts = useCachedFetch<StockCountsMonth>(`secondary-stock:${fy.year}:${userId}:${month}`, () => getStockCounts(userId, month));
  const data = counts.data?.month === month ? counts.data : null;
  const rows = (data?.distributors ?? []).filter((d) => d.totals.issuedQty > 0 || d.totals.openingQty > 0 || d.totals.primaryQty > 0);
  return (
    <View style={{ gap: 12 }}>
      <ReportList
        title="Distributors"
        rows={rows}
        state={counts}
        hasData={data !== null}
        tiles={data ? [
          { label: 'Value', value: formatRupees(data.totals.issuedAmountPaise), accent: 'green' },
          { label: 'Units', value: data.totals.issuedQty, accent: 'blue' },
          { label: 'Status', value: STOCK_COUNT_STATUS_TEXT[data.status], accent: STOCK_COUNT_STATUS_ACCENT[data.status] },
        ] : undefined}
        empty="No secondary entered this month."
        render={(d) => (
          <ReportRow
            key={d.distributorId}
            title={d.name}
            subtitle={`Opening ${d.totals.openingQty} · Primary ${d.totals.primaryQty} · Secondary ${d.totals.issuedQty} · Closing ${d.totals.closingQty}`}
            value={formatRupees(d.totals.issuedAmountPaise)}
            pill={{ text: STOCK_COUNT_STATUS_TEXT[d.status], accent: STOCK_COUNT_STATUS_ACCENT[d.status] }}
            onPress={() => router.push({ pathname: '/report/secondary-distributor', params: { month, distributorId: d.distributorId, userId } } as unknown as Href)}
          />
        )}
        download={() => downloadSecondarySheet({ id: userId, name: personName }, fy.year, fy.label.replace(/^FY /, ''))}
      />
      {data && data.status !== 'NOT_ENTERED' ? (
        <>
          <ThemedText type="smallBold">{`Proof files${data.attachments.length ? ` (${data.attachments.length})` : ''}`}</ThemedText>
          <ProofFiles files={data.attachments} />
        </>
      ) : null}
      {data?.status === 'PENDING' ? <PrimaryButton label="Decide in Approvals →" variant="text" onPress={() => router.push('/(tabs)/team')} /> : null}
    </View>
  );
}
