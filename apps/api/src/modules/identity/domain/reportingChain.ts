/** Bounds a walk up a chain through already-corrupted data; real chains are ~5 levels. */
export const MAX_CHAIN_DEPTH = 50;

/**
 * Walks upward from `start` through `managerOf`; true if `target` is on the way (not counting `start` itself). A loop that does
 * not reach `target` ends the walk with `false`.
 */
export async function reachesUpward(managerOf: (userId: string) => Promise<string | null>, start: string, target: string): Promise<boolean> {
  const seen = new Set<string>();
  let current = await managerOf(start);
  for (let depth = 0; current !== null && depth < MAX_CHAIN_DEPTH; depth++) {
    if (current === target) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = await managerOf(current);
  }
  return false;
}
