/**
 * Pure rules for any tree: keyboard navigation (WAI-ARIA tree pattern) and expansion state.
 * React-free so they are tested in Node. (Territory-specific rules live in the feature.)
 */

/** What keyboard navigation needs to know about each visible row, in on-screen order. */
export interface TreeItemInfo {
  id: string;
  parentId: string | null;
  /** `true` open, `false` closed, `undefined` for a leaf. */
  expanded: boolean | undefined;
}

export type TreeMove = { focus: string } | { expand: string } | { collapse: string } | null;

/** The effect of an arrow/Home/End key on the focused row, or `null` when it does nothing. */
export function navigate(items: readonly TreeItemInfo[], currentId: string, key: string): TreeMove {
  const index = items.findIndex((i) => i.id === currentId);
  const current = items[index];
  if (!current) return null;

  switch (key) {
    case 'ArrowDown':
      return items[index + 1] ? { focus: items[index + 1]!.id } : null;
    case 'ArrowUp':
      return items[index - 1] ? { focus: items[index - 1]!.id } : null;
    case 'Home':
      return { focus: items[0]!.id };
    case 'End':
      return { focus: items[items.length - 1]!.id };
    case 'ArrowRight': {
      if (current.expanded === false) return { expand: current.id };
      if (current.expanded === true) {
        const child = items[index + 1];
        return child && child.parentId === current.id ? { focus: child.id } : null;
      }
      return null;
    }
    case 'ArrowLeft':
      if (current.expanded === true) return { collapse: current.id };
      return current.parentId ? { focus: current.parentId } : null;
    default:
      return null;
  }
}

export function toggleSet(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function addToSet(set: ReadonlySet<string>, id: string): Set<string> {
  return set.has(id) ? new Set(set) : new Set(set).add(id);
}
