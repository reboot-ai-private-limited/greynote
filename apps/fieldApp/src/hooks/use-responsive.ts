import { useWindowDimensions } from 'react-native';

/** Width at which the layout switches from phone to tablet (iPad portrait is 768). */
export const TABLET_MIN_WIDTH = 768;

/**
 * Screen-size helper so every screen adapts the same way. Content is centred and capped at
 * MaxContentWidth (constants/theme.ts) on wide screens; use `columns` for tile grids.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;
  return { width, height, isTablet, isLandscape: width > height, columns: isTablet ? 3 : 2 };
}
