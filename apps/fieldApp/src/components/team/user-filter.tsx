import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { useTeam } from '@/offline/team';

/**
 * A team screen opened from a person's page carries `?userId=`: it then shows only that person. `clear` goes back to the whole team
 * without leaving the screen. The server checks the person is in the caller's team; a stranger is a 403, never an empty list.
 */
export function useUserFilter() {
  const { userId: param } = useLocalSearchParams<{ userId?: string }>();
  const [cleared, setCleared] = useState(false);
  const userId = !cleared && typeof param === 'string' && param !== '' ? param : undefined;
  return { userId, clear: () => setCleared(true) };
}

/** "Showing only Asha Rao" with a way back to everyone. Renders nothing for the whole team. */
export function UserFilterBanner({ userId, onClear }: { userId: string | undefined; onClear: () => void }) {
  const { team } = useTeam();
  if (!userId) return null;
  const name = team.find((t) => t.id === userId)?.name ?? 'one person';
  return (
    <View>
      <Notice tone="info">{`Showing only ${name}.`}</Notice>
      <PrimaryButton label="Show everyone" variant="text" onPress={onClear} />
    </View>
  );
}
