import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * Bottom tabs, per PRD §6.1: Home, Docs, Reports, and Team — Team only for managers (anyone
 * with direct reports). `hidden` removes it completely, so an MR can't reach it by any route.
 * Web has its own tab bar in app-tabs.web.tsx; keep the two lists in step.
 */
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const { isManager } = useCurrentUser();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      // Android's default ('auto') labels every tab with 3 items but only the selected one with 4+.
      // Pin 'labeled' so every tab always shows its name, for field and manager logins alike.
      labelVisibilityMode="labeled"
      iconColor={{ default: colors.textSecondary, selected: colors.primary }}
      labelStyle={{ selected: { color: colors.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md="home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="docs">
        <NativeTabs.Trigger.Label>Docs</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
          md="description"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="reports">
        <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
          md="bar_chart"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="team" hidden={!isManager}>
        <NativeTabs.Trigger.Label>Team</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.3', selected: 'person.3.fill' }}
          md="groups"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
