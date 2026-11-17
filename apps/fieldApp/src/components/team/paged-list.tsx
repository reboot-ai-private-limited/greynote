import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { ApiError, NetworkError } from '@/lib/api';
import type { Paged } from '@/lib/team-section';
import { useOnline } from '@/offline';

import { Notice } from '../notice';
import { PrimaryButton } from '../primary-button';
import { Skeleton } from '../skeleton';
import { TextField } from '../text-field';

type Props<T extends { id: string }> = {
  fetchPage: (page: number, search: string) => Promise<Paged<T>>;
  renderItem: (item: T) => ReactNode;
  searchLabel: string;
  emptyText: string;
  offlineText: string;
  /** A change here starts the list again from page 1 (a filter chosen above it). */
  resetKey?: string;
};

/** A searchable list read a page at a time from the server (online only), with "Show more". Used by the team chemist, distributor and route lists. */
export function PagedList<T extends { id: string }>({ fetchPage, renderItem, searchLabel, emptyText, offlineText, resetKey = '' }: Props<T>) {
  const online = useOnline();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<T[] | null>(null);
  const [meta, setMeta] = useState<{ page: number; totalPages: number; total: number }>({ page: 0, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);

  const load = useCallback(
    async (page: number, term: string) => {
      const mine = ++ticket.current;
      setLoading(true);
      try {
        const res = await fetchPage(page, term);
        if (mine !== ticket.current) return;
        setItems((prev) => (page === 1 || !prev ? res.items : [...prev, ...res.items]));
        setMeta({ page: res.page, totalPages: res.totalPages, total: res.total });
        setError(null);
      } catch (err) {
        if (mine !== ticket.current) return;
        setError(err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.');
      } finally {
        if (mine === ticket.current) setLoading(false);
      }
    },
    [fetchPage],
  );

  // First page on open, and again a moment after the search text (or a filter above) changes.
  useEffect(() => {
    if (!online) return;
    const t = setTimeout(() => void load(1, search), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [online, search, resetKey, load]);

  return (
    <>
      {!online ? <Notice tone="info">{offlineText}</Notice> : null}
      <TextField label={searchLabel} value={search} onChangeText={setSearch} autoCapitalize="none" editable={online} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {loading && !items ? <Skeleton cards={3} lines={2} /> : null}
      {items && items.length === 0 ? <Notice tone="info">{search.trim() ? 'Nothing matches that search.' : emptyText}</Notice> : null}
      {(items ?? []).map((i) => renderItem(i))}
      {items && meta.page < meta.totalPages ? <PrimaryButton label={`Show more (${items.length} of ${meta.total})`} variant="text" loading={loading} onPress={() => void load(meta.page + 1, search)} /> : null}
    </>
  );
}
