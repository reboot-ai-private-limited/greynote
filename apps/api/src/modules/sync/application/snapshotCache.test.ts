import { describe, expect, it } from 'vitest';
import { SnapshotCache } from './snapshotCache.js';

describe('SnapshotCache (2026-11-27)', () => {
  it('reuses a snapshot within its time, then builds again', () => {
    let t = 0;
    const cache = new SnapshotCache(60_000, 10, () => t);
    cache.set('u1', 'planning', { canonical: { a: 1 }, version: 'v1' });
    t = 59_999;
    expect(cache.get('u1', 'planning')).toMatchObject({ version: 'v1' });
    t = 60_000;
    expect(cache.get('u1', 'planning')).toBeNull();
  });
  it('a push forgets only that user’s copies; it never grows past its bound', () => {
    const cache = new SnapshotCache(60_000, 2, () => 0);
    cache.set('u1', 'a', { canonical: 1, version: '1' });
    cache.set('u2', 'a', { canonical: 2, version: '2' });
    cache.forget('u1');
    expect(cache.get('u1', 'a')).toBeNull();
    expect(cache.get('u2', 'a')).not.toBeNull();
    cache.set('u3', 'a', { canonical: 3, version: '3' });
    cache.set('u4', 'a', { canonical: 4, version: '4' });
    expect(cache.get('u2', 'a')).toBeNull();
  });
});
