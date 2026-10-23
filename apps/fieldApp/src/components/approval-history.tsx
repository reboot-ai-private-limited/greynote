import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isOneApproval, type ApprovalAction, type ApprovalDetail } from '@/lib/approvals';
import { formatWhen } from '@/offline/day';

import { ThemedText } from './themed-text';

const ACTION_TEXT: Record<ApprovalAction['action'], string> = {
  SUBMIT: 'Submitted',
  RESUBMIT: 'Sent again',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  WITHDRAW: 'Withdrawn',
  REOPEN: 'Reopened',
};

const HISTORY: SymbolViewProps['name'] = { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' } as SymbolViewProps['name'];

type Tone = 'done' | 'bad' | 'warn' | 'pending';
const MARK: Record<Tone, string> = { done: '✓', bad: '✕', warn: '!', pending: '' };

/** The request's history as a timeline, oldest first, ending in what it is waiting for. */
export function ApprovalHistory({ request }: { request: ApprovalDetail }) {
  const theme = useTheme();
  const color: Record<Tone, string> = { done: Accents.green.solid, bad: theme.danger, warn: Accents.amber.solid, pending: Accents.amber.solid };

  const items: { title: string; note: string; tone: Tone; comment?: string | null }[] = request.history.map((h) => ({
    title: `${ACTION_TEXT[h.action]}${h.actor ? ` · ${h.actor.name}` : ''}`,
    note: formatWhen(h.at),
    tone: h.action === 'REJECT' ? 'bad' : h.action === 'WITHDRAW' || h.action === 'REOPEN' ? 'warn' : 'done',
    comment: h.comment,
  }));
  // One approval (plans, services; 2026-10-23): a single step, the manager's or Admin's, and nothing after it.
  const one = isOneApproval(request);
  if (request.status === 'SUBMITTED') items.push(one ? { title: 'Approval', note: 'Waiting for the manager or Admin', tone: 'pending' } : { title: 'Manager review', note: 'Pending', tone: 'pending' });
  else if (request.status === 'MANAGER_APPROVED' && !one) items.push({ title: 'Final approval', note: 'Pending', tone: 'pending' });

  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.head}>
        <View style={[styles.chip, { backgroundColor: Accents.purple.bg }]}>
          <SymbolView name={HISTORY} size={18} tintColor={Accents.purple.solid} />
        </View>
        <ThemedText type="smallBold" style={styles.title}>
          History
        </ThemedText>
      </View>
      {items.map((it, i) => (
        <View key={i} style={styles.step}>
          <View style={styles.rail}>
            <View style={[styles.mark, { backgroundColor: it.tone === 'pending' ? theme.background : color[it.tone], borderColor: color[it.tone] }]}>
              <ThemedText type="smallBold" style={styles.markText}>
                {MARK[it.tone]}
              </ThemedText>
            </View>
            {i < items.length - 1 ? <View style={[styles.line, { backgroundColor: theme.border }]} /> : null}
          </View>
          <View style={styles.text}>
            <ThemedText type="smallBold" themeColor={it.tone === 'pending' ? 'textSecondary' : 'text'}>
              {it.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
              {it.note}
            </ThemedText>
            {it.comment ? (
              <ThemedText type="small" style={styles.note}>
                {`“${it.comment}”`}
              </ThemedText>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  chip: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 22 },
  step: { flexDirection: 'row', gap: Spacing.three },
  rail: { alignItems: 'center', width: 22 },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16 },
  line: { width: 2, flex: 1, minHeight: 14 },
  text: { flex: 1, paddingBottom: Spacing.three },
  note: { fontSize: 12, lineHeight: 16 },
});
