import { useCallback, useRef, useState } from 'react';

import type { OutletOption } from '@/components/outlet-picker';
import { PICKER_PAGE_SIZE, searchPickerDoctors, type PickerDoctor } from '@/lib/added-doctors';
import { useOnline } from '@/offline';

const toOption = (d: PickerDoctor): OutletOption => ({ id: d.id, name: d.name, subtitle: d.subtitle, photoUrl: d.photoUrl });

/**
 * The service request form's searchable doctor list (docs/mobile/service-requests.md §2): each search and each page is read
 * from the server, so a long team list never has to be on the phone. An answer to an older search is dropped. With no
 * connection, or if the server can't be reached, the doctors already on the phone (`cached`) are filtered by name instead.
 */
export function useDoctorPicker(manager: boolean, cached: OutletOption[]) {
  const online = useOnline();
  const [query, setQuery] = useState('');
  const [state, setState] = useState<{ items: OutletOption[]; total: number; page: number; loading: boolean; failed: boolean }>({
    items: [],
    total: 0,
    page: 0,
    loading: false,
    failed: false,
  });
  const latest = useRef(0);
  // Every doctor the picker has shown, so the chosen one keeps its name when a new search no longer lists it.
  const seen = useRef(new Map<string, OutletOption>());

  const load = useCallback(
    async (text: string, page: number) => {
      const ticket = ++latest.current;
      setState((s) => ({ ...s, loading: true, failed: false }));
      try {
        const res = await searchPickerDoctors(manager, text, page);
        if (ticket !== latest.current) return;
        const rows = res.items.map(toOption);
        rows.forEach((o) => seen.current.set(o.id, o));
        setState((s) => ({
          items: page === 1 ? rows : [...s.items, ...rows.filter((o) => !s.items.some((x) => x.id === o.id))],
          total: res.total,
          page,
          loading: false,
          failed: false,
        }));
      } catch {
        if (ticket !== latest.current) return;
        setState((s) => ({ ...s, loading: false, failed: true }));
      }
    },
    [manager],
  );

  const search = useCallback(
    (text: string) => {
      setQuery(text);
      if (online) void load(text, 1);
    },
    [load, online],
  );

  const more = useCallback(() => {
    if (!online || state.loading || state.failed || state.page === 0 || state.items.length >= state.total) return;
    void load(query, state.page + 1);
  }, [load, online, query, state]);

  // Until the first answer arrives, and whenever the server can't answer, the list on the phone stands in.
  const remote = online && !state.failed && state.page > 0;
  const needle = query.trim().toLowerCase();
  const options = remote ? state.items : needle ? cached.filter((o) => o.name.toLowerCase().includes(needle)) : cached;

  return {
    options,
    search,
    more,
    loading: online && state.loading,
    remote,
    pageSize: PICKER_PAGE_SIZE,
    find: (id: string | null) => (id ? (seen.current.get(id) ?? cached.find((o) => o.id === id) ?? null) : null),
  };
}
