/** True when `text` contains every word of `query`, ignoring case. An empty query matches everything. */
export function matchesSearch(text: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = text.toLowerCase();
  return words.every((w) => haystack.includes(w));
}
