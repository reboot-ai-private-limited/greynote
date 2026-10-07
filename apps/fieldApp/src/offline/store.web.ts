import { MemoryStore } from './memory-store';
import type { Store } from './types';

// Web is for quick UI checks only — a browser tab is never where a field day is run — so the
// local store is in memory there. SQLite on web would need wasm bundler setup for no real use.
export const store: Store = new MemoryStore();
