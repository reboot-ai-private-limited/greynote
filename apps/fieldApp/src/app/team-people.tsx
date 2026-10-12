import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { listTeamMembers, type TeamMember, type TeamScopeFilter } from '@/lib/team-section';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';

const SCOPES: { value: TeamScopeFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'direct', label: 'Direct reports' },
  { value: 'indirect', label: 'Further down' },
];

/**
 * Team → People (docs/mobile/team.md): the roster of your downline, nearest first, with a search. Tap a person for their page.
 * Everyone below you is listed; only your direct reports can be acted on elsewhere. Needs a connection.
 */
export default function TeamPeopleScreen() {
  const online = useOnline();
  const [scope, setScope] = useState<TeamScopeFilter>('all');
  const [search, setSearch] = useState('');
  const term = search.trim();

  const list = useCachedFetch<{ items: TeamMember[]; total: number }>(`team-members:${scope}:${term}`, () => listTeamMembers({ scope, search: term || undefined }));
  const people = list.data?.items ?? [];

  return (
    <ScreenShell title="People" subtitle="Your team" onRefresh={list.reload} refreshing={list.refreshing}>
      <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
      <ChoiceChips options={SCOPES} value={scope} onChange={setScope} />
      {!online ? <Notice tone="info">You’re offline. Connect to see your team.</Notice> : null}
      {list.error && online ? <Notice tone="danger">{list.error}</Notice> : null}
      {list.loading && !list.data ? <Skeleton cards={4} lines={2} /> : null}
      {list.data ? <SummaryStrip items={[{ label: 'People', value: list.data.total, accent: 'blue' }, { label: 'Managers', value: people.filter((p) => p.isManager).length, accent: 'purple' }]} /> : null}
      {list.data && people.length === 0 ? <Notice tone="info">{term ? 'Nobody matches that search.' : 'You have nobody in your team yet.'}</Notice> : null}
      {people.map((p) => (
        <InfoCard key={p.id}>
          <View style={styles.row}>
            <Avatar name={p.name} accent={p.depth === 1 ? 'blue' : 'slate'} size={40} />
            <View style={styles.grow}>
              <ThemedText type="smallBold" numberOfLines={1}>{`${p.name} · ${p.employeeCode}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {[p.designation, p.hq?.name, p.zone?.name].filter(Boolean).join(' · ')}
              </ThemedText>
            </View>
            <View style={styles.pills}>
              <Pill text={p.depth === 1 ? 'Direct' : `Level ${p.depth}`} accent={p.depth === 1 ? 'blue' : 'slate'} />
              {p.isManager ? <Pill text="Manager" accent="purple" /> : null}
            </View>
          </View>
          <ThemedText type="small" themeColor="primary" onPress={() => router.push({ pathname: '/team-member', params: { id: p.id } })}>
            View person →
          </ThemedText>
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  pills: { alignItems: 'flex-end', gap: Spacing.one },
});
