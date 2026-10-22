import type { ApprovalPublicContract } from '@/modules/approval/approval.public.js';
import type { FieldMasterDataPublicContract } from '@/modules/field-master-data/field-master-data.public.js';
import type { HrPublicContract } from '@/modules/hr/hr.public.js';
import type { OffboardingImpact, OffboardingPort, OffboardingStep } from '@/modules/identity/identity.public.js';
import type { MarketingPublicContract } from '@/modules/marketing/marketing.public.js';
import type { PlanningPublicContract } from '@/modules/planning/planning.public.js';
import type { TerritoryPublicContract } from '@/modules/territory/territory.public.js';
import { logger } from '@/shared/logging/logger.js';

export interface OffboardingSources {
  territory: Pick<TerritoryPublicContract, 'countUserHoldings' | 'releaseUserHoldings'>;
  fieldMasterData: Pick<FieldMasterDataPublicContract, 'countLeaverWork' | 'releaseLeaverDoctors' | 'releaseLeaverDistributors'>;
  planning: Pick<PlanningPublicContract, 'countLeaverPlans' | 'closeLeaverPlans'>;
  hr: Pick<HrPublicContract, 'countLeaverLeaves' | 'closeLeaverLeaves'>;
  marketing: Pick<MarketingPublicContract, 'countLeaverTargets' | 'cutLeaverTargets'>;
  approval: Pick<ApprovalPublicContract, 'listWaitingOnManagers'>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Runs one part; a failure is reported, logged and never stops the others. */
async function step(name: OffboardingStep['step'], userId: string, run: () => Promise<string>): Promise<OffboardingStep> {
  try {
    return { step: name, ok: true, detail: await run() };
  } catch (err) {
    logger.error({ err, userId, step: name }, 'offboarding step failed');
    return { step: name, ok: false, detail: 'Not done: something went wrong. Deactivate again to retry this part.' };
  }
}

/**
 * Identity's `OffboardingPort`, built from the contracts of the modules that hold what a leaving employee had (decision-log
 * 2026-10-22). Doctors go first, while the leaver's routes still show who had what; each part is independent and safe to repeat.
 */
export function makeOffboarding(s: OffboardingSources): OffboardingPort {
  return {
    async impact(userId: string, lastWorkingDay: string): Promise<OffboardingImpact> {
      const [holdings, work, plansAfter, leavesAfter, targetsAfter, waiting] = await Promise.all([
        s.territory.countUserHoldings(userId),
        s.fieldMasterData.countLeaverWork(userId),
        s.planning.countLeaverPlans(userId, lastWorkingDay),
        s.hr.countLeaverLeaves(userId, lastWorkingDay),
        s.marketing.countLeaverTargets(userId, lastWorkingDay),
        s.approval.listWaitingOnManagers(),
      ]);
      return {
        routes: holdings.routes,
        coverage: holdings.coverage,
        doctors: work.doctors,
        distributors: work.distributors,
        plansAfter,
        leavesAfter,
        targetsAfter,
        waitingOnThem: waiting.filter((w) => w.managerId === userId).length,
      };
    },

    async release(userId, { lastWorkingDay, doctorHandoverTo }, actorId): Promise<OffboardingStep[]> {
      return [
        await step('DOCTORS', userId, async () => {
          const r = await s.fieldMasterData.releaseLeaverDoctors(userId, doctorHandoverTo, actorId);
          return `${plural(r.handedOver, 'doctor')} handed over, ${r.unassigned} left unassigned.`;
        }),
        await step('DISTRIBUTORS', userId, async () => `Taken off ${plural(await s.fieldMasterData.releaseLeaverDistributors(userId), 'distributor')}.`),
        await step('TERRITORY', userId, async () => {
          const r = await s.territory.releaseUserHoldings(userId, actorId);
          return `${plural(r.routes, 'route')} ended, ${plural(r.coverage, 'covered HQ or Zone', 'covered HQs or Zones')} cleared.`;
        }),
        await step('PLANS', userId, async () => `${plural(await s.planning.closeLeaverPlans(userId, lastWorkingDay), 'plan')} after the last working day closed.`),
        await step('LEAVE', userId, async () => `${plural(await s.hr.closeLeaverLeaves(userId, lastWorkingDay), 'leave request')} after the last working day closed.`),
        await step('TARGETS', userId, async () => {
          const r = await s.marketing.cutLeaverTargets(userId, lastWorkingDay, actorId);
          return `${plural(r.cut, 'target')} cut at the leaving month, ${r.removed} removed.`;
        }),
      ];
    },
  };
}
