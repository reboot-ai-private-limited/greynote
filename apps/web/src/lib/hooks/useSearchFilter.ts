'use client';

import { useEffect, useState } from 'react';
import { timing } from './timing';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * A search box backed by a URL param: the input updates instantly, the URL (and so the query)
 * only after the user pauses typing.
 */
export function useSearchFilter(current: string, commit: (value: string) => void) {
  const [text, setText] = useState(current);
  const debounced = useDebouncedValue(text, timing.searchDebounceMs);

  useEffect(() => {
    if (debounced !== current) commit(debounced);
    // `commit` changes with the URL; only a new debounced value should push to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return [text, setText] as const;
}
