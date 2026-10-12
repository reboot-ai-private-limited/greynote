import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Accents, Gradients, Spacing } from '@/constants/theme';
import type { Feature } from '@/features/catalog';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

const icon = (name: string): SymbolViewProps['name'] => ({ ios: name, android: name, web: name }) as SymbolViewProps['name'];
const LOCK = icon('lock');
const ARROW: SymbolViewProps['name'] = { ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' } as SymbolViewProps['name'];

type Props = {
  feature: Feature;
  /** Why the tile is locked; null when it can be opened. */
  lockedReason: string | null;
  /** Tile width in points; the grid sets it so a wide tile lines up with the tiles above it. */
  width: number;
  onOpen: () => void;
  onLockedPress: (reason: string) => void;
  /** A count to show on the tile (the Inbox's unread messages); "99+" above 99, nothing at 0. */
  badge?: string | null;
};

/** One Home tile. A locked tile stays visible (and tappable, to explain itself) but dimmed. */
export function FeatureTile({ feature, lockedReason, width, onOpen, onLockedPress, badge }: Props) {
  const theme = useTheme();
  const locked = lockedReason !== null;
  const accent = Accents[feature.accent];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={locked ? `${feature.title}, locked` : feature.title}
      onPress={() => (lockedReason !== null ? onLockedPress(lockedReason) : onOpen())}
      style={({ pressed }) => [{ width }, locked && styles.locked, pressed && styles.pressed]}>
      {feature.cta ? (
        <LinearGradient
          colors={locked ? [theme.placeholder, theme.textSecondary] : Gradients.cta}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.tile, styles.cta]}>
          <View style={styles.ctaIcon}>
            <SymbolView name={locked ? LOCK : feature.icon} size={22} tintColor="#FFFFFF" />
          </View>
          <View style={styles.flex}>
            <ThemedText type="smallBold" numberOfLines={2} style={styles.ctaTitle}>
              {feature.title}
            </ThemedText>
            <ThemedText type="small" numberOfLines={3} style={styles.ctaSubtitle}>
              {feature.subtitle}
            </ThemedText>
          </View>
          <View style={styles.ctaArrow}>
            <SymbolView name={ARROW} size={18} tintColor={locked ? theme.textSecondary : Accents.red.solid} />
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.tile, { backgroundColor: accent.bg, borderColor: accent.border }]}>
          <View style={[styles.chip, { backgroundColor: locked ? theme.textSecondary : accent.solid }]}>
            <SymbolView name={locked ? LOCK : feature.icon} size={22} tintColor="#FFFFFF" />
            {badge ? (
              <View style={styles.badge} accessibilityLabel={`${badge} unread`}>
                <ThemedText type="smallBold" style={styles.badgeText}>
                  {badge}
                </ThemedText>
              </View>
            ) : null}
          </View>
          <View style={styles.text}>
            <ThemedText type="smallBold" numberOfLines={2} style={styles.title}>
              {feature.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.subtitle}>
              {feature.subtitle}
            </ThemedText>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },
  locked: { opacity: 0.6 },
  tile: {
    minHeight: 128,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Accents.red.solid,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14 },
  text: { gap: Spacing.half },
  title: { fontSize: 15, lineHeight: 20 },
  subtitle: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', borderWidth: 0, gap: Spacing.three },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  ctaTitle: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
  ctaSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 16, fontWeight: 400 },
  ctaArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
