import { useState } from 'react';

import { useOnEndReached } from './use-end-reached';

/**
 * Shows a list that is already on the phone 20 rows at a time, adding 20 each time the reader scrolls near the bottom. A change of `resetKey`
 * (the filter or the search) starts again from the first 20. Call it before any early return of the screen.
 */
export function useWindowed<T>(rows: T[], resetKey: string, size = 20) {
  const [shown, setShown] = useState({ key: '', count: size });
  const count = shown.key === resetKey ? shown.count : size;
  useOnEndReached(() => {
    if (count < rows.length) setShown({ key: resetKey, count: count + size });
  });
  return { visible: rows.slice(0, count), total: rows.length };
}
