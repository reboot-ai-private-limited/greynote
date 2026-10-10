import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApprovalRow } from '@/components/approval-row';
import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing, WideContentWidth } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { bulkDecide, listInbox, listTeam, type ApprovalItem, type TeamScope } from '@/lib/approvals';
import { useOnline } from '@/offline';

type View_ = 'inbox' | 'team';
type TeamFilter = Extract<TeamScope, 'all' | 'direct' | 'indirect'>;

const VIEWS: { value: View_; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'team', label: 'Team activity' },
];
const SCOPES: { value: TeamFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'direct', label: 'Direct reports' },
  { value: 'indirect', label: 'Further down' },
];

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Team (PRD §7.1, managers only). Inbox: what your direct reports sent that waits on you. Team activity: your whole
 * downline's requests — direct reports you can act on, deeper levels are read-only. Tap a request to review it.
 * Needs a connection: approvals are decided on the server's live state.
 */
export default function TeamScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const [view, setView] = useState<View_>('inbox');
  const [scope, setScope] = useState<TeamFilter>('all');
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Bulk: tick several requests you can act on and decide them together.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStep, setBulkStep] = useState<null | 'approve' | 'reject'>(null);
  const [bulkComment, setBulkComment] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ tone: 'danger' | 'success' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    (async () => {
      try {
        const page = view === 'inbox' ? await listInbox() : await listTeam(scope);
        if (!alive) return;
        setItems(page.items);
        setError(null);
      } catch (err) {
        if (alive) setError(errorText(err));
      } finally {
        if (alive) setRefreshing(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [online, view, scope, reloadKey, fy.year]);

  // Coming back from a request (after a decision) shows the list as it now stands.
  useFocusEffect(
    useCallback(() => {
      setReloadKey((k) => k + 1);
    }, []),
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  }, []);

  // A past year is read-only: nothing in it can be decided from here.
  const actionable = fy.isPast ? [] : (items ?? []).filter((i) => i.canAct);
  const pickedItems = actionable.filter((i) => selected.has(i.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    setBulkStep(null);
    setBulkComment('');
  };

  const runBulk = async () => {
    if (!bulkStep || pickedItems.length === 0) return;
    if (bulkStep === 'reject' && !bulkComment.trim()) {
      setBulkMsg({ tone: 'danger', text: 'Give the reason for rejecting — the employees will see it.' });
      return;
    }
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const { results } = await bulkDecide(bulkStep === 'approve' ? 'APPROVE' : 'REJECT', pickedItems, bulkComment);
      const done = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      const word = bulkStep === 'approve' ? 'approved' : 'rejected';
      setBulkMsg(
        failed.length === 0
          ? { tone: 'success', text: `${done} request${done === 1 ? '' : 's'} ${word}.` }
          : { tone: 'warning', text: `${done} ${word}, ${failed.length} not done: ${failed.map((f) => (f.ok ? '' : f.message)).join('; ')}` },
      );
      endSelecting();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setBulkMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBulkBusy(false);
    }
  };

  const switchView = (next: View_) => {
    endSelecting();
    setItems(null);
    setError(null);
    setView(next);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <ThemedText type="subtitle">Team</ThemedText>
          <FyBanner />
          <ChoiceChips options={VIEWS} value={view} onChange={switchView} />
          {view === 'team' ? <ChoiceChips options={SCOPES} value={scope} onChange={(s) => { setItems(null); setScope(s); }} /> : null}

          {view === 'inbox' && actionable.length > 0 && !selecting ? (
            <PrimaryButton label="Select several" variant="text" onPress={() => { setBulkMsg(null); setSelecting(true); }} />
          ) : null}
          {selecting ? (
            <ThemedView type="backgroundElement" style={styles.bulk}>
              <ThemedText type="smallBold">{`${pickedItems.length} selected`}</ThemedText>
              {bulkStep ? (
                <>
                  <TextField
                    label={bulkStep === 'approve' ? 'Comment (optional)' : 'Reason (required)'}
                    value={bulkComment}
                    onChangeText={(t) => { setBulkComment(t); setBulkMsg(null); }}
                    multiline
                    maxLength={500}
                    editable={!bulkBusy}
                  />
                  <PrimaryButton label={bulkStep === 'approve' ? `Confirm: approve ${pickedItems.length}` : `Confirm: reject ${pickedItems.length}`} loading={bulkBusy} onPress={runBulk} />
                  <PrimaryButton label="Back" variant="text" disabled={bulkBusy} onPress={() => setBulkStep(null)} />
                </>
              ) : (
                <>
                  <PrimaryButton label={`Approve ${pickedItems.length}`} disabled={pickedItems.length === 0} onPress={() => { setBulkMsg(null); setBulkStep('approve'); }} />
                  <PrimaryButton label={`Reject ${pickedItems.length}`} variant="text" disabled={pickedItems.length === 0} onPress={() => { setBulkMsg(null); setBulkStep('reject'); }} />
                  <PrimaryButton label="Cancel" variant="text" onPress={endSelecting} />
                </>
              )}
            </ThemedView>
          ) : null}
          {bulkMsg ? <Notice tone={bulkMsg.tone}>{bulkMsg.text}</Notice> : null}

          {!online ? <Notice tone="info">You’re offline. Approvals need the internet — connect to see and decide requests.</Notice> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {online && items === null && !error ? <Skeleton cards={3} lines={3} /> : null}
          {items !== null && items.length === 0 ? (
            <Notice tone="info">
              {view === 'inbox' ? 'Nothing is waiting for you. New requests from your team show up here.' : 'No requests from your team yet.'}
            </Notice>
          ) : null}
          {(items ?? []).map((item) => (
            <ApprovalRow
              key={item.id}
              item={item}
              selecting={selecting && item.canAct}
              selected={selected.has(item.id)}
              onPress={() => (selecting ? (item.canAct ? toggle(item.id) : undefined) : router.push({ pathname: '/approval/[id]', params: { id: item.id } }))}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bulk: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: WideContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
});
