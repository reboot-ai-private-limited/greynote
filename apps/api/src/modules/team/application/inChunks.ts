/** `fn` over every item, a few at a time, so a team of hundreds does not open hundreds of database reads at once. Order is kept. */
export async function mapInChunks<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  size = 20,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}
