import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { TextField } from './text-field';
import { ThemedText } from './themed-text';

/** A date typed as three boxes — day, month, year — for dates far back (a birth date) that a day-by-day stepper cannot reach. */
export type DateParts = { d: string; m: string; y: string };

export const EMPTY_PARTS: DateParts = { d: '', m: '', y: '' };

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** `YYYY-MM-DD` split into the three boxes; an empty or missing date gives empty boxes. */
export function partsFromIso(iso: string | null | undefined): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return match ? { d: String(Number(match[3])), m: String(Number(match[2])), y: match[1]! } : EMPTY_PARTS;
}

/**
 * The three boxes as `YYYY-MM-DD`. All three empty is "no date" (`iso: null`). Anything else must be a real calendar day, from 1900
 * up to `today` (`YYYY-MM-DD`); otherwise `error` says so and `iso` is null.
 */
export function isoFromParts(p: DateParts, today: string): { iso: string | null; error: string | null } {
  if (p.d.trim() === '' && p.m.trim() === '' && p.y.trim() === '') return { iso: null, error: null };
  const day = Number(p.d);
  const month = Number(p.m);
  const year = Number(p.y);
  const real = Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year) && year >= 1900 && year <= 9999 && month >= 1 && month <= 12 && day >= 1;
  const iso = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  if (!real || new Date(`${iso}T00:00:00Z`).getUTCDate() !== day) return { iso: null, error: 'Enter a real date: day, month and year.' };
  if (iso > today) return { iso: null, error: 'That date is in the future.' };
  return { iso, error: null };
}

type Props = {
  label: string;
  value: DateParts;
  onChange: (value: DateParts) => void;
  disabled?: boolean;
  error?: string | undefined;
};

const digits = (text: string, max: number) => text.replace(/[^0-9]/g, '').slice(0, max);

export function DateField({ label, value, onChange, disabled, error }: Props) {
  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.row}>
        <View style={styles.small}>
          <TextField label="Day" value={value.d} onChangeText={(d) => onChange({ ...value, d: digits(d, 2) })} keyboardType="number-pad" placeholder="DD" editable={!disabled} />
        </View>
        <View style={styles.small}>
          <TextField label="Month" value={value.m} onChangeText={(m) => onChange({ ...value, m: digits(m, 2) })} keyboardType="number-pad" placeholder="MM" editable={!disabled} />
        </View>
        <View style={styles.year}>
          <TextField label="Year" value={value.y} onChangeText={(y) => onChange({ ...value, y: digits(y, 4) })} keyboardType="number-pad" placeholder="YYYY" editable={!disabled} error={error} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
  small: { flex: 1 },
  year: { flex: 1.4 },
});
