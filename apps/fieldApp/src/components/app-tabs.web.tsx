import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useTheme } from '@/hooks/use-theme';

/**
 * Web version of app-tabs.tsx: the same four tabs, the same Team rule, and the same place: a bar along the BOTTOM of the screen with an
 * icon over each name, like the phone's native tabs. (It used to be the starter's floating bar pinned over the top of the page, which sat on
 * top of Home's header and made the Profile button unreachable.) The bar is part of the layout, not laid over it, so nothing is covered.
 * Keep the two lists in step.
 */
export default function AppTabs() {
  const { isManager } = useCurrentUser();

  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <BottomBar>
          <TabTrigger name="index" href="/(tabs)" asChild>
            <TabButton icon="home">Home</TabButton>
          </TabTrigger>
          <TabTrigger name="docs" href="/docs" asChild>
            <TabButton icon="description">Docs</TabButton>
          </TabTrigger>
          <TabTrigger name="reports" href="/reports" asChild>
            <TabButton icon="bar_chart">Reports</TabButton>
          </TabTrigger>
          {isManager ? (
            <TabTrigger name="team" href="/team" asChild>
              <TabButton icon="groups">Team</TabButton>
            </TabTrigger>
          ) : null}
        </BottomBar>
      </TabList>
    </Tabs>
  );
}

/** The Material icon names the phone's tabs use (`md=` in app-tabs.tsx). */
const symbol = (name: string): SymbolViewProps['name'] => ({ ios: name, android: name, web: name }) as SymbolViewProps['name'];

function TabButton({ children, isFocused, icon, ...props }: TabTriggerSlotProps & { icon: string }) {
  const theme = useTheme();
  const color = isFocused ? theme.primary : theme.textSecondary;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: Boolean(isFocused) }} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      <SymbolView name={symbol(icon)} size={24} tintColor={color} />
      <ThemedText type="small" themeColor={isFocused ? 'primary' : 'textSecondary'} style={isFocused ? styles.labelOn : undefined}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

function BottomBar(props: TabListProps) {
  const theme = useTheme();
  return (
    <View {...props} style={[styles.bar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  // The tabs fill the screen; the page takes everything above the bar.
  root: { flex: 1, height: '100%' },
  slot: { flex: 1 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'stretch',
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.one,
  },
  pressed: { opacity: 0.7 },
  labelOn: { fontWeight: '600' },
});
