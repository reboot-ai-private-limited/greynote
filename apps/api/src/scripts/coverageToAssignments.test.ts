import { describe, expect, it } from 'vitest';
import { usersToAssign } from './coverageToAssignments.js';

const scopes = new Map([
  ['a', { zoneIds: ['z1'], hqIds: ['h1'], routeIds: ['r1'] }],
  ['b', { zoneIds: ['z2'], hqIds: ['h2'], routeIds: ['r3'] }],
  ['c', { zoneIds: ['z1'], hqIds: ['h9'], routeIds: ['r9'] }],
]);

describe('usersToAssign', () => {
  it('picks everyone whose zone, HQ or route meets the distributor, except those already assigned', () => {
    expect(usersToAssign({ zoneIds: ['z1'], hqIds: [], routeIds: [], assignedUserIds: ['c'] }, scopes)).toEqual(['a']);
    expect(usersToAssign({ zoneIds: [], hqIds: ['h2'], routeIds: [], assignedUserIds: [] }, scopes)).toEqual(['b']);
    expect(usersToAssign({ zoneIds: [], hqIds: [], routeIds: ['r1', 'r3'], assignedUserIds: [] }, scopes)).toEqual(['a', 'b']);
  });
  it('leaves a distributor that covers nothing alone', () => {
    expect(usersToAssign({ zoneIds: [], hqIds: [], routeIds: [], assignedUserIds: [] }, scopes)).toEqual([]);
  });
});
