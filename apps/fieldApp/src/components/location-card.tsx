import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { CardSection, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import type { LocationReading } from '@/hooks/use-location-reading';
import { useOnline } from '@/offline';

type Props = {
  /** `visit`: checked against a doctor's or chemist's registered place. `capture`: the reading becomes the place's location (adding a doctor or chemist). */
  mode: 'visit' | 'capture';
  noun: 'doctor' | 'chemist';
  /** The place the reading is for (visit mode); `null` before one is chosen. */
  place: { id: string; name: string; hasLocation: boolean } | null;
  reading: LocationReading | null;
  busy: boolean;
  onRefresh: () => void;
  /** Pulls the latest doctors and chemists from the server, for a place that has no registered location yet (needs the internet). */
  onCheckAgain?: (() => Promise<void>) | undefined;
};

/**
 * Where you are, before you save. **Refresh location** takes a new GPS reading now (it works without the internet) and says how far you are from the place and whether
 * the GPS is good enough; Save uses a reading under two minutes old, or reads again itself. For a place with no registered location, **Check again** reads the latest
 * from the server, which needs the internet ("Connect to the internet first" when there is none).
 */
export function LocationCard({ mode, noun, place, reading, busy, onRefresh, onCheckAgain }: Props) {
  const online = useOnline();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mine = reading && (mode === 'capture' || reading.placeId === place?.id) ? reading : null;
  const r = mine?.result ?? null;

  const checkAgain = async () => {
    if (!onCheckAgain) return;
    if (!online) return setNote('Connect to the internet first.');
    setChecking(true);
    setNote(null);
    try {
      await onCheckAgain();
      setNote('Updated from the server.');
    } catch {
      setNote('Could not update. Try again.');
    } finally {
      setChecking(false);
    }
  };

  let line: { tone: 'info' | 'success' | 'warning' | 'danger'; text: string };
  if (busy) line = { tone: 'info', text: 'Getting your location…' };
  else if (!mine) line = { tone: 'info', text: mode === 'visit' && place ? `Your location has not been read yet. Tap Refresh to check you are at ${place.name}.` : 'Your location has not been read yet. Tap Refresh.' };
  else if (!mine.fix) line = { tone: 'danger', text: 'Couldn’t get your location. Turn on location (GPS), allow it for this app, and refresh.' };
  else if (mine.fix.accuracyMeters !== null && mine.fix.accuracyMeters > mine.maxAccuracyMeters) line = { tone: 'warning', text: `GPS is weak (±${Math.round(mine.fix.accuracyMeters)} m, it needs ±${mine.maxAccuracyMeters} m or better). Move into the open and refresh.` };
  else if (mode === 'capture') line = { tone: 'success', text: `✓ Location read (±${Math.round(mine.fix.accuracyMeters ?? 0)} m, ${mine.takenAt}). It becomes the ${noun}’s location when you save.` };
  else if (r?.reason === 'NO_REGISTERED_LOCATION') line = { tone: 'warning', text: `This ${noun} has no registered location yet, so a call can’t be saved. Ask Admin to set it, then check again.` };
  else if (r?.status === 'PASS') line = { tone: 'success', text: `✓ ${r.distanceMeters} m from ${place?.name ?? `the ${noun}`} (±${Math.round(mine.fix.accuracyMeters ?? 0)} m, ${mine.takenAt}). You are at the ${noun}.` };
  else line = { tone: 'danger', text: `${r?.distanceMeters ?? '?'} m from ${place?.name ?? `the ${noun}`}: the limit is ${mine.radiusMeters} m. Go closer and refresh.` };

  return (
    <CardSection icon={sym('location', 'my_location')} accent={line.tone === 'success' ? 'green' : line.tone === 'danger' ? 'red' : 'blue'} title="Your location">
      <Notice tone={line.tone}>{line.text}</Notice>
      <View style={styles.row}>
        <PrimaryButton label={busy ? 'Getting your location…' : 'Refresh location'} variant="text" disabled={busy || (mode === 'visit' && !place)} onPress={onRefresh} />
        {onCheckAgain && mode === 'visit' && place && !place.hasLocation ? <PrimaryButton label={checking ? 'Checking…' : 'Check again'} variant="text" disabled={checking} onPress={() => void checkAgain()} /> : null}
      </View>
      {note ? <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText> : null}
    </CardSection>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' } });
