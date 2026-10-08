import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

const RATIO = 702 / 523;

/** The Greynote Healthcare logo (assets/images/logo.png). `width` sets the size; the height follows. */
export function BrandLogo({ width = 200 }: { width?: number }) {
  return (
    <Image
      source={require('@/assets/images/logo.png')}
      style={[styles.logo, { width, height: width / RATIO }]}
      contentFit="contain"
      accessibilityLabel="Greynote Healthcare"
    />
  );
}

const styles = StyleSheet.create({ logo: {} });
