import { describe, expect, it } from 'vitest';
import { planDistributor } from './distributorMigration.js';

describe('planDistributor', () => {
  it('turns the route into a list and the MR and ASM into assigned people, and removes the old fields', () => {
    expect(planDistributor({ routeId: 'r1', assignedMrId: 'mr', assignedAsmId: 'asm', primarySalesEnabled: true, secondarySalesEnabled: false })).toEqual({
      set: { routeIds: ['r1'], assignedUserIds: ['mr', 'asm'] },
      unset: ['routeId', 'assignedMrId', 'assignedAsmId', 'primarySalesEnabled', 'secondarySalesEnabled'],
    });
  });
  it('skips empty and repeated people', () => {
    expect(planDistributor({ routeId: 'r1', assignedMrId: null, assignedAsmId: 'asm' })?.set.assignedUserIds).toEqual(['asm']);
    expect(planDistributor({ routeId: 'r1', assignedMrId: 'same', assignedAsmId: 'same' })?.set.assignedUserIds).toEqual(['same']);
    expect(planDistributor({ routeId: 'r1' })?.set.assignedUserIds).toEqual([]);
  });
  it('leaves a document already in the new shape alone', () => {
    expect(planDistributor({ routeIds: ['r1'], assignedUserIds: [] })).toBeNull();
  });
  it('only removes the leftovers of a half-migrated document', () => {
    expect(planDistributor({ routeIds: ['r1'], assignedUserIds: ['a'], primarySalesEnabled: true })).toEqual({ set: {}, unset: ['primarySalesEnabled'] });
  });
});
