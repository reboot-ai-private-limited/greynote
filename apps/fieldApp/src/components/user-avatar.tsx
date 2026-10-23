import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type Props = {
  name: string;
  /** The profile picture's address; with none (or one that fails to load) the first letter of the name shows instead. */
  photoUrl: string | null;
  size: number;
  /** `onBlue` for the blue Home header (translucent white circle); `plain` for a light page (solid brand colour). */
  tone?: 'onBlue' | 'plain';
  /** Two initials ("RM" for Rajdeep Majumdar) instead of the first letter: a doctor's avatar (docs/mobile/doctors.md section 2). */
  initials?: boolean;
};

const lettersOf = (name: string, two: boolean) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (two && words.length > 1 ? `${words[0]![0]}${words.at(-1)![0]}` : words[0]![0]!).toUpperCase();
};

/** A round profile picture, or the first letter (or two initials) of the name on a circle. */
export function UserAvatar({ name, photoUrl, size, tone = 'onBlue', initials = false }: Props) {
  const theme = useTheme();
  // A photo that cannot be loaded (offline, deleted) falls back to the letter; a new address gets another try.
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!photoUrl && failed !== photoUrl;
  const round = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.ring, round, tone === 'plain' && { backgroundColor: theme.primary, borderColor: theme.border }]}>
      {showPhoto ? (
        <Image source={{ uri: photoUrl }} style={round} contentFit="cover" accessibilityLabel={`${name} profile picture`} onError={() => setFailed(photoUrl)} />
      ) : (
        <ThemedText type="smallBold" style={[styles.letter, { fontSize: Math.round(size * (initials ? 0.38 : 0.45)), lineHeight: Math.round(size * 0.58) }]}>
          {lettersOf(name, initials)}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' },
  letter: { color: '#FFFFFF' },
});
