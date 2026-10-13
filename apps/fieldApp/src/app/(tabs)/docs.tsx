import { useState } from 'react';
import { Linking, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { PillToggle } from '@/components/pill-toggle';
import { PrimaryButton } from '@/components/primary-button';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardSection, InfoCard, Pill, RowCard, SummaryStrip, sym } from '@/components/ui-cards';
import { BottomTabInset, Spacing, WideContentWidth, type Accent } from '@/constants/theme';
import { CATEGORY_LABEL, listMyDocuments, listMyPayslips, type CompanyDocument, type DocumentCategory, type MyPayslip } from '@/lib/docs';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { formatSize } from '@/lib/proof-picker';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen, prettyMonth } from '@/offline/day';

type Section = 'PAYSLIPS' | 'DOCUMENTS';
const SECTIONS: { value: Section; label: string }[] = [
  { value: 'PAYSLIPS', label: 'Payslips' },
  { value: 'DOCUMENTS', label: 'Documents' },
];

const CATEGORY_ACCENT: Record<DocumentCategory, Accent> = { POLICY: 'purple', CIRCULAR: 'blue', FORM: 'teal', OTHER: 'slate' };
const KIND_LABEL = { pdf: 'PDF', jpeg: 'JPG', png: 'PNG' } as const;

type Filter = 'ALL' | DocumentCategory;

/** The phone's share sheet with the document's title and link (docs.md rule 7: a share option beside Open, which the viewer also offers Save on). */
async function shareDocument(title: string, url: string) {
  try {
    await Share.share(Platform.OS === 'ios' ? { title, url } : { title, message: `${title}\n${url}` });
  } catch {
    // The sheet could not open; Open still works.
  }
}

/** One payslip opened: earnings, deductions, gross and net. The phone adds nothing up itself; the server did. */
function SlipView({ slip, onBack }: { slip: MyPayslip; onBack: () => void }) {
  const s = slip.slip;
  return (
    <View style={styles.stack}>
      <InfoCard>
        <ThemedText type="small" themeColor="textSecondary">{prettyMonth(slip.month)}</ThemedText>
        <ThemedText type="subtitle">{`Net ${formatRupees(s.netPaise)}`}</ThemedText>
        {slip.finalizedAt ? <ThemedText type="small" themeColor="textSecondary">{`Finalized ${formatWhen(slip.finalizedAt)}`}</ThemedText> : null}
      </InfoCard>
      <SummaryStrip
        items={[
          { label: 'Gross', value: formatRupees(s.grossPaise), accent: 'green' },
          { label: 'Deductions', value: formatRupees(s.deductionPaise), accent: 'red' },
          { label: 'Net', value: formatRupees(s.netPaise), accent: 'blue' },
        ]}
      />
      <CardSection icon={sym('plus.circle', 'add_circle')} accent="green" title="Earnings" count={s.earnings.length}>
        {s.earnings.map((l, i) => (
          <View key={`${l.label}-${i}`} style={styles.line}>
            <ThemedText type="small" style={styles.grow}>{l.label}</ThemedText>
            <ThemedText type="smallBold">{formatRupees(l.amountPaise)}</ThemedText>
          </View>
        ))}
      </CardSection>
      <CardSection icon={sym('minus.circle', 'do_not_disturb_on')} accent="red" title="Deductions" count={s.deductions.length}>
        {s.deductions.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">No deductions this month.</ThemedText>
        ) : (
          s.deductions.map((l, i) => (
            <View key={`${l.label}-${i}`} style={styles.line}>
              <ThemedText type="small" style={styles.grow}>{l.label}</ThemedText>
              <ThemedText type="smallBold">{formatRupees(l.amountPaise)}</ThemedText>
            </View>
          ))
        )}
      </CardSection>
      <PrimaryButton label="Back to payslips" variant="text" onPress={onBack} />
    </View>
  );
}

function Payslips({ year }: { year: number }) {
  const online = useOnline();
  const list = useCachedFetch<MyPayslip[]>(`payslips:${year}`, listMyPayslips);
  const [open, setOpen] = useState<string | null>(null);
  const slips = list.data ?? [];
  const slip = slips.find((s) => s.id === open) ?? null;
  const fy = useFinancialYear();

  if (slip) return <SlipView slip={slip} onBack={() => setOpen(null)} />;

  return (
    <View style={styles.stack}>
      {list.stale && list.fetchedAt && list.data ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}.`}</Notice> : null}
      {list.error && online && !list.data ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !list.data ? <Skeleton cards={3} lines={2} /> : null}
      {!list.data && !online ? <Notice tone="info">Connect once to load your payslips.</Notice> : null}
      {list.data && slips.length === 0 ? (
        <Notice tone="info">{`No payslips for FY ${fy.year}-${String((fy.year + 1) % 100).padStart(2, '0')} yet. They appear once payroll is finalized.`}</Notice>
      ) : null}
      {slips.map((s) => (
        <RowCard
          key={s.id}
          icon={sym('doc.text', 'receipt_long')}
          accent="green"
          title={prettyMonth(s.month)}
          subtitle={`Gross ${formatRupees(s.slip.grossPaise)} · Deductions ${formatRupees(s.slip.deductionPaise)}`}
          right={<ThemedText type="smallBold">{formatRupees(s.slip.netPaise)}</ThemedText>}
          onPress={() => setOpen(s.id)}
        />
      ))}
      {slips.length > 0 ? <ThemedText type="small" themeColor="textSecondary">Net is what you are paid. Employer contributions are not on the slip.</ThemedText> : null}
    </View>
  );
}

function Documents() {
  const online = useOnline();
  // Documents are not tied to a year, so the key does not carry one.
  const list = useCachedFetch<CompanyDocument[]>('company-documents', listMyDocuments);
  const [filter, setFilter] = useState<Filter>('ALL');
  const docs = (list.data ?? []).filter((d) => filter === 'ALL' || d.category === filter);
  const present = new Set((list.data ?? []).map((d) => d.category));

  return (
    <View style={styles.stack}>
      {list.stale && list.fetchedAt && list.data ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}.`}</Notice> : null}
      {list.error && online && !list.data ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !list.data ? <Skeleton cards={3} lines={2} /> : null}
      {!list.data && !online ? <Notice tone="info">Connect once to load your documents.</Notice> : null}
      {list.data && list.data.length > 0 ? (
        <ChoiceChips
          options={[{ value: 'ALL' as const, label: 'All' }, ...(Object.keys(CATEGORY_LABEL) as DocumentCategory[]).filter((c) => present.has(c)).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
          value={filter}
          onChange={setFilter}
        />
      ) : null}
      {list.data && list.data.length === 0 ? <Notice tone="info">No documents have been shared with you yet.</Notice> : null}
      {docs.map((d) => (
        <InfoCard key={d.id}>
          <View style={styles.line}>
            <View style={styles.grow}>
              <ThemedText type="smallBold" numberOfLines={2}>{d.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`${KIND_LABEL[d.fileKind]} · ${formatSize(d.sizeBytes)} · ${formatWhen(d.uploadedAt)}`}</ThemedText>
            </View>
            <Pill text={CATEGORY_LABEL[d.category]} accent={CATEGORY_ACCENT[d.category]} />
          </View>
          <View style={styles.actions}>
            <PrimaryButton label="Open" variant="text" disabled={!online} onPress={() => void Linking.openURL(d.url)} />
            <PrimaryButton label="Share" variant="text" disabled={!online} onPress={() => void shareDocument(d.title, d.url)} />
          </View>
        </InfoCard>
      ))}
    </View>
  );
}

/**
 * Docs (PRD §6.2 C, docs/mobile/docs.md): your own payslips (finalized only, for the financial year in view) and the documents
 * an Admin shared with you. Read only: nothing here can be uploaded from the phone. Opening a file hands its link to the
 * system viewer.
 */
export default function DocsScreen() {
  const fy = useFinancialYear();
  const [section, setSection] = useState<Section>('PAYSLIPS');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Docs</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Your payslips and company documents</ThemedText>
          <FyBanner />
          <PillToggle options={SECTIONS} value={section} onChange={setSection} />
          {section === 'PAYSLIPS' ? <Payslips year={fy.year} /> : <Documents />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: WideContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
    gap: Spacing.three,
  },
  stack: { gap: Spacing.three },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
