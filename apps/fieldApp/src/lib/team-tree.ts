import type { DayState, TeamDayRow, TeamMember } from './team-section';

/**
 * The manager's team as a tree, for drilling down (an RSM or ZSM opens an ASM and sees the MRs). The server gives the roster with
 * each person's `managerId` and today's state per person, but no per-manager totals, so the totals are counted here from the two lists.
 */
export type Rollup = {
  /** Everyone below the manager (not counting the manager). */
  people: number;
  reported: number;
  working: number;
  notStarted: number;
  onLeave: number;
  blocked: number;
  attention: number;
};

export type TeamNode = {
  member: TeamMember;
  day: TeamDayRow | null;
  /** Direct reports of this person, in the order the roster gave them. */
  children: TeamNode[];
  /** Totals for everyone below this person; all zero for someone with no team. */
  rollup: Rollup;
};

const empty = (): Rollup => ({ people: 0, reported: 0, working: 0, notStarted: 0, onLeave: 0, blocked: 0, attention: 0 });

const addState = (into: Rollup, day: TeamDayRow | null) => {
  into.people += 1;
  if (!day) return;
  const state: DayState = day.state;
  if (state === 'REPORTED') into.reported += 1;
  else if (state === 'WORKING') into.working += 1;
  else if (state === 'NOT_STARTED' || state === 'MISSED') into.notStarted += 1;
  else if (state === 'ON_LEAVE') into.onLeave += 1;
  if (day.blocked) into.blocked += 1;
  if (day.attention) into.attention += 1;
};

/**
 * Builds the tree. People whose manager is not in the roster (the caller's own direct reports) are the top level. A cycle or a
 * missing manager can't hang the build: each person is placed once.
 */
export function buildTeamTree(members: TeamMember[], today: TeamDayRow[]): { roots: TeamNode[]; byId: Map<string, TeamNode> } {
  const dayOf = new Map(today.map((d) => [d.user.id, d]));
  const byId = new Map<string, TeamNode>();
  for (const m of members) byId.set(m.id, { member: m, day: dayOf.get(m.id) ?? null, children: [], rollup: empty() });

  const roots: TeamNode[] = [];
  for (const node of byId.values()) {
    const parent = node.member.managerId ? byId.get(node.member.managerId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const seen = new Set<string>();
  const fill = (node: TeamNode): Rollup => {
    if (seen.has(node.member.id)) return node.rollup;
    seen.add(node.member.id);
    const total = empty();
    for (const child of node.children) {
      addState(total, child.day);
      const below = fill(child);
      total.people += below.people;
      total.reported += below.reported;
      total.working += below.working;
      total.notStarted += below.notStarted;
      total.onLeave += below.onLeave;
      total.blocked += below.blocked;
      total.attention += below.attention;
    }
    node.rollup = total;
    return total;
  };
  roots.forEach(fill);
  return { roots, byId };
}

/** "8 people · 2 not started · 1 blocked", or "6 people · all on track" when nothing needs a look. */
export function rollupText(r: Rollup): string {
  if (r.people === 0) return 'No team';
  const parts = [`${r.people} ${r.people === 1 ? 'person' : 'people'}`];
  if (r.notStarted) parts.push(`${r.notStarted} not started`);
  if (r.blocked) parts.push(`${r.blocked} blocked`);
  if (r.onLeave) parts.push(`${r.onLeave} on leave`);
  if (parts.length === 1) parts.push('all on track');
  return parts.join(' · ');
}

/** Blocked and not-started people first, then by name — so what needs a look is on top at every level. */
export function sortByAttention(nodes: TeamNode[]): TeamNode[] {
  const weight = (n: TeamNode) => (n.day?.blocked ? 0 : n.day?.state === 'NOT_STARTED' || n.day?.state === 'MISSED' ? 1 : n.day?.attention || n.rollup.attention + n.rollup.blocked + n.rollup.notStarted > 0 ? 2 : 3);
  return [...nodes].sort((a, b) => weight(a) - weight(b) || a.member.name.localeCompare(b.member.name));
}

/** The people from the top down to `id`, for the breadcrumb ("ASM Ravi" under "RSM Anil"). */
export function pathTo(byId: Map<string, TeamNode>, id: string | null): TeamNode[] {
  const path: TeamNode[] = [];
  let at = id ? byId.get(id) : undefined;
  const guard = new Set<string>();
  while (at && !guard.has(at.member.id)) {
    guard.add(at.member.id);
    path.unshift(at);
    at = at.member.managerId ? byId.get(at.member.managerId) : undefined;
  }
  return path;
}
