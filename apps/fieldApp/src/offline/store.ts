import { SqliteStore } from './sqlite-store';
import type { Store } from './types';

// Phones: SQLite. The web build resolves store.web.ts instead (memory only).
export const store: Store = new SqliteStore();
