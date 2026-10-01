'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Filters live in the URL, not component state: a filtered view survives reload, can be shared,
 * and the back button works. Setting a filter resets `page` to 1 — a new filter on page 7 of the
 * old result set is an empty screen.
 */
export function useFilterParams<K extends string>(keys: readonly K[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const update = useCallback(
    (changes: Partial<Record<K | 'page', string | number | undefined>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (!('page' in changes)) next.delete('page');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [params, pathname, router],
  );

  return { values, page, update };
}
