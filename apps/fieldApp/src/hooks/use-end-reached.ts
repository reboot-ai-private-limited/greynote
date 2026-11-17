import { createContext, useContext, useEffect, type MutableRefObject } from 'react';

/** Held by ScreenShell: the one function to call when the reader scrolls near the bottom (or the content is too short to scroll). */
export const EndReachedContext = createContext<MutableRefObject<(() => void) | null> | null>(null);

/**
 * Infinite scroll: `onEnd` runs when the screen's scroll area is near its bottom. It can fire several times while the reader stays there, so
 * `onEnd` must ignore the call while a page is loading or when there is nothing more (the lists do). The latest `onEnd` is always the one called.
 */
export function useOnEndReached(onEnd: () => void) {
  const ref = useContext(EndReachedContext);
  useEffect(() => {
    if (!ref) return;
    ref.current = onEnd;
    return () => {
      if (ref.current === onEnd) ref.current = null;
    };
  });
}
