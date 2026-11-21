import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { DoctorLine } from '@/lib/team-section';
import { formatWhen } from '@/offline/day';

import { ThemedText } from '../themed-text';

/** The doctors a plan lists, by name: ✓ called (with the time and the call's remarks), – not yet, ✗ missed (a past day). Then those called who were not planned. */
export function DoctorLines({ planned, alsoVisited, past }: { planned: DoctorLine[]; alsoVisited: DoctorLine[]; past: boolean }) {
  if (planned.length === 0 && alsoVisited.length === 0) return null;
  return (
    <View style={styles.list}>
      {planned.map((d) => (
        <Line key={d.id} d={d} mark={d.visited ? '✓' : past ? '✗' : '–'} tone={d.visited ? 'primary' : past ? 'danger' : 'textSecondary'} />
      ))}
      {alsoVisited.length > 0 ? <ThemedText type="small" themeColor="textSecondary">Also visited (not planned)</ThemedText> : null}
      {alsoVisited.map((d) => (
        <Line key={`x${d.id}`} d={d} mark="✓" tone="primary" />
      ))}
    </View>
  );
}

function Line({ d, mark, tone }: { d: DoctorLine; mark: string; tone: 'primary' | 'danger' | 'textSecondary' }) {
  return (
    <View style={styles.line}>
      <ThemedText type="smallBold" themeColor={tone} style={styles.mark}>{mark}</ThemedText>
      <View style={styles.grow}>
        <ThemedText type="small">{d.name}</ThemedText>
        {d.visited && (d.visitedAt || d.remarks) ? (
          <ThemedText type="small" themeColor="textSecondary">{[d.visitedAt ? formatWhen(d.visitedAt) : null, d.remarks].filter(Boolean).join(' · ')}</ThemedText>
        ) : null}
        {d.samples?.length ? <ThemedText type="small" themeColor="textSecondary">{`Sample: ${d.samples.map((s) => `${s.productName} × ${s.quantity}`).join(', ')}`}</ThemedText> : null}
        {d.lbl?.length ? <ThemedText type="small" themeColor="textSecondary">{`LBL: ${d.lbl.join(', ')}`}</ThemedText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.one },
  line: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  mark: { width: 16, textAlign: 'center' },
  grow: { flex: 1 },
});
