import { useEffect, useState } from 'react';

/** `value` after it has stopped changing for `ms` (the search box: wait for the typing to pause before searching). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return out;
}
