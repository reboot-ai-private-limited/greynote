import { describe, expect, it } from 'vitest';
import { makeOffboarding, type OffboardingSources } from './offboarding.js';

function sources(over: Partial<{ [K in keyof OffboardingSources]: Partial<OffboardingSources[K]> }> = {}): OffboardingSources {
  return {
    territory: { countUserHoldings: async () => ({ routes: 3, coverage: 2 }), releaseUserHoldings: async () => ({ routes: 3, coverage: 2 }), ...over.territory },
    fieldMasterData: {
      countLeaverWork: async () => ({ doctors: 10, distributors: 1 }),
      releaseLeaverDoctors: async () => ({ handedOver: 8, unassigned: 2 }),
      releaseLeaverDistributors: async () => 1,
      ...over.fieldMasterData,
    },
    planning: { countLeaverPlans: async () => 2, closeLeaverPlans: async () => 2, ...over.planning },
    hr: { countLeaverLeaves: async () => 1, closeLeaverLeaves: async () => 1, ...over.hr },
    marketing: { countLeaverTargets: async () => 1, cutLeaverTargets: async () => ({ cut: 1, removed: 0 }), ...over.marketing },
    approval: {
      listWaitingOnManagers: async () => [{ managerId: 'asm' }, { managerId: 'asm' }, { managerId: 'other' }] as never,
      ...over.approval,
    },
  };
}

describe('offboarding', () => {
  it('adds up the impact, counting only the requests waiting on this person', async () => {
    expect(await makeOffboarding(sources()).impact('asm', '2026-10-20')).toEqual({
      routes: 3, coverage: 2, doctors: 10, distributors: 1, plansAfter: 2, leavesAfter: 1, targetsAfter: 1, waitingOnThem: 2,
    });
  });

  it('releases every part, doctors first, and says what each did', async () => {
    const steps = await makeOffboarding(sources()).release('asm', { lastWorkingDay: '2026-10-20', doctorHandoverTo: 'mr1' }, 'admin');
    expect(steps.map((s) => s.step)).toEqual(['DOCTORS', 'DISTRIBUTORS', 'TERRITORY', 'PLANS', 'LEAVE', 'TARGETS']);
    expect(steps[0]).toEqual({ step: 'DOCTORS', ok: true, detail: '8 doctors handed over, 2 left unassigned.' });
    expect(steps.every((s) => s.ok)).toBe(true);
  });

  it('a part that fails is reported and the others still run', async () => {
    const steps = await makeOffboarding(
      sources({ planning: { closeLeaverPlans: async () => { throw new Error('mongo down'); } } }),
    ).release('asm', { lastWorkingDay: '2026-10-20', doctorHandoverTo: null }, 'admin');
    expect(steps.find((s) => s.step === 'PLANS')).toMatchObject({ ok: false });
    expect(steps.filter((s) => s.ok)).toHaveLength(5);
  });
});
