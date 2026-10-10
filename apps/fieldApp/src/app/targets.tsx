import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ApiError, NetworkError } from '@/lib/api';
import { getTarget, setTarget, type TargetSummary } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { useSessionUser } from '@/lib/session';
import { useColleagues, useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { MonthStepper } from '@/components/month-stepper';
import { businessToday, monthOf, prettyMonth } from '@/offline/day';
import type { ConfigSnapshot, FieldMasterDataSnapshot } from '@/types/sync';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Targets (PRD §6.2): what you are meant to sell in a month against what you and your team ordered.
 * A manager's figure is their own target plus their team's. A manager can also set a target for
 * themselves or someone below them. Needs a connection — the figures are worked out live.
 */
export default function TargetsScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const { isManager } = useCurrentUser();
  const config = useCachedSource<ConfigSnapshot>('config');
  const { colleagues } = useColleagues();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const thisMonth = monthOf(businessToday(config.data?.settings.BUSINESS_TIMEZONE, new Date(), config.data?.settings.DAY_START_TIME));

  const [picked, setMonth] = useState<string | null>(null);
  const month = picked ?? thisMonth;
  const [tick, setTick] = useState(0);
  // Optional narrowing (PRD §6.2): '' means every product.
  const [productId, setProductId] = useState('');
  // The answer is kept with the request it belongs to, so "loading" is simply "no answer for this request yet".
  const requestKey = `${me?.id}:${month}:${productId}:${tick}`;
  const [answer, setAnswer] = useState<{ key: string; summary: TargetSummary | null; error: string | null } | null>(null);

  const [setting, setSetting] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!me || !online) return;
    let alive = true;
    getTarget(me.id, month, { productId: productId || undefined })
      .then((summary) => alive && setAnswer({ key: requestKey, summary, error: null }))
      .catch((err) => alive && setAnswer({ key: requestKey, summary: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, [me, month, online, requestKey, productId]);
  const current = answer?.key === requestKey ? answer : null;
  const summary = current?.summary ?? null;
  const error = current?.error ?? null;
  const loading = online && !current;

  const team = colleagues.filter((c) => c.relation === 'TEAM');
  const people = [{ id: me?.id ?? '', name: 'Me', subtitle: me?.employeeCode }, ...team.map((c) => ({ id: c.id, name: c.name, subtitle: c.designation ?? c.employeeCode }))];

  const save = async () => {
    const targetAmountPaise = rupeesToPaise(amount);
    if (!who) return setMsg({ tone: 'danger', text: 'Choose who the target is for.' });
    if (targetAmountPaise === null) return setMsg({ tone: 'danger', text: 'Enter the amount in rupees, more than zero.' });
    setBusy(true);
    try {
      await setTarget({ userId: who, month, targetAmountPaise, productId: productId || null });
      setMsg({ tone: 'success', text: 'Target saved.' });
      setSetting(false);
      setAmount('');
      setTick((t) => t + 1);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const productOptions = [{ id: '', name: 'All products' }, ...(master.data?.products ?? []).map((p) => ({ id: p.id, name: p.name }))];

  const percent = summary && summary.effectiveTargetPaise > 0 ? Math.round((summary.achievedPaise / summary.effectiveTargetPaise) * 100) : null;

  return (
    <ScreenShell title="Targets">
      <MonthStepper value={month} onChange={setMonth} />

      <OutletPicker label="Product" options={productOptions} value={productId} onChange={setProductId} emptyText="No products yet." />

      {!online ? <Notice tone="warning">Targets are worked out on the server. Connect to see them.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {loading && !summary ? <Notice tone="info">Loading…</Notice> : null}

      {summary ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {summary.downlineCount > 0 ? `Your target and your team’s (${summary.downlineCount} ${summary.downlineCount === 1 ? 'person' : 'people'})` : 'Your target'}
          </ThemedText>
          <ThemedText type="subtitle">{formatRupees(summary.effectiveTargetPaise)}</ThemedText>
          <ThemedText type="small">{`Achieved ${formatRupees(summary.achievedPaise)}${percent !== null ? ` · ${percent}%` : ''}`}</ThemedText>
          {summary.effectiveTargetPaise === 0 ? <ThemedText type="small" themeColor="textSecondary">No target is set for this month.</ThemedText> : null}
          {summary.downlineCount > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {`Yours ${formatRupees(summary.ownTargetPaise)} · Team ${formatRupees(summary.downlineTargetPaise)}`}
            </ThemedText>
          ) : null}
        </ThemedView>
      ) : null}

      {isManager && online ? (
        setting ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{`Set a target for ${prettyMonth(month)}`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {productId ? 'It applies to the product chosen above.' : 'It applies to all products. Choose a product above to narrow it.'}
            </ThemedText>
            <OutletPicker label="For" options={people} value={who} onChange={setWho} disabled={busy} emptyText="No one to choose." />
            <TextField label="Target (₹)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" editable={!busy} />
            <PrimaryButton label="Save target" loading={busy} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setSetting(false)} />
          </ThemedView>
        ) : (
          <PrimaryButton label="Set a target" onPress={() => (setMsg(null), setSetting(true))} />
        )
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
