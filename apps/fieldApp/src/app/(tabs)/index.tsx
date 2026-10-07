import { router } from 'expo-router';

import { PrimaryButton } from '@/components/primary-button';
import { TabPlaceholder } from '@/components/tab-placeholder';
import { SyncChip } from '@/components/sync-chip';
import { ThemedText } from '@/components/themed-text';
import { useCurrentUser } from '@/hooks/use-current-user';

// TODO: the real Home dashboard (PRD §6.2) is the next feature — today's Tour Plan status,
// compliance-block banner, and the DCR / Marketing / Resources / Utility tiles.
export default function HomeScreen() {
  const user = useCurrentUser();

  return (
    <TabPlaceholder
      title="Home"
      summary="Your daily work: plans, calls, expenses and orders."
      header={
        <>
          <ThemedText type="smallBold">Hello, {user.name || 'there'}</ThemedText>
          <SyncChip />
          <PrimaryButton label="Profile & logout" variant="text" onPress={() => router.push('/profile')} />
        </>
      }
      upcoming={[
        'Today’s Tour Plan status',
        'DCR: Daily Plan, Dr Call, Chemist Call, Followups, Expense, Summary, Final Submit',
        'Marketing: Orders, Visuals, Campaigns, Targets, Gifts, Services',
        'Resources and Utility: Holidays, Forms, Financial Year',
      ]}
    />
  );
}
