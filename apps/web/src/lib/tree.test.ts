import { describe, expect, it } from 'vitest';
import { addToSet, navigate, toggleSet, type TreeItemInfo } from './tree';

// Zone A (open) > HQ 1 (closed), HQ 2 (open) > Area x ; Zone B (closed)
const items: TreeItemInfo[] = [
  { id: 'A', parentId: null, expanded: true },
  { id: 'H1', parentId: 'A', expanded: false },
  { id: 'H2', parentId: 'A', expanded: true },
  { id: 'x', parentId: 'H2', expanded: undefined },
  { id: 'B', parentId: null, expanded: false },
];

describe('navigate', () => {
  it('moves down and up, stopping at the ends', () => {
    expect(navigate(items, 'A', 'ArrowDown')).toEqual({ focus: 'H1' });
    expect(navigate(items, 'H1', 'ArrowUp')).toEqual({ focus: 'A' });
    expect(navigate(items, 'A', 'ArrowUp')).toBeNull();
    expect(navigate(items, 'B', 'ArrowDown')).toBeNull();
  });

  it('jumps to the first and last row', () => {
    expect(navigate(items, 'H2', 'Home')).toEqual({ focus: 'A' });
    expect(navigate(items, 'A', 'End')).toEqual({ focus: 'B' });
  });

  it('ArrowRight expands a closed row, then enters an open one', () => {
    expect(navigate(items, 'H1', 'ArrowRight')).toEqual({ expand: 'H1' });
    expect(navigate(items, 'H2', 'ArrowRight')).toEqual({ focus: 'x' });
    expect(navigate(items, 'x', 'ArrowRight')).toBeNull();
  });

  it('does not "enter" an open row whose children have not loaded', () => {
    const empty: TreeItemInfo[] = [{ id: 'A', parentId: null, expanded: true }, { id: 'B', parentId: null, expanded: false }];
    expect(navigate(empty, 'A', 'ArrowRight')).toBeNull();
  });

  it('ArrowLeft collapses an open row, else goes to the parent', () => {
    expect(navigate(items, 'H2', 'ArrowLeft')).toEqual({ collapse: 'H2' });
    expect(navigate(items, 'H1', 'ArrowLeft')).toEqual({ focus: 'A' });
    expect(navigate(items, 'x', 'ArrowLeft')).toEqual({ focus: 'H2' });
    expect(navigate(items, 'B', 'ArrowLeft')).toBeNull();
  });

  it('ignores other keys and unknown rows', () => {
    expect(navigate(items, 'A', 'a')).toBeNull();
    expect(navigate(items, 'nope', 'ArrowDown')).toBeNull();
  });
});

describe('expansion sets', () => {
  it('toggles without mutating', () => {
    const open = new Set(['A']);
    expect(toggleSet(open, 'A').has('A')).toBe(false);
    expect(toggleSet(open, 'B').has('B')).toBe(true);
    expect(open.size).toBe(1);
  });
  it('addToSet is idempotent', () => {
    expect([...addToSet(new Set(['A']), 'A')]).toEqual(['A']);
  });
});
