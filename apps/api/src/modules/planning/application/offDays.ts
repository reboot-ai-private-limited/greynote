import { monthRange } from '@/shared/time/businessTime.js';
import type { PlanOffDay, PlanOffDaysSource } from '../domain/offDays.js';

/**
 * The days locked on a Monthly Plan (weekly off, holidays), read from HR. HR sits on Planning's tier, so it can't be imported:
 * the composition root binds HR's `listPlanOffDays` once both are built. Until then nothing is locked (scripts that build
 * Planning alone, and tests that don't bind it).
 */
export class OffDays {
  private source: PlanOffDaysSource = async () => [];

  bind(source: PlanOffDaysSource): void {
    this.source = source;
  }

  list(userId: string, from: string, to: string): Promise<PlanOffDay[]> {
    return this.source(userId, from, to);
  }

  forMonth(userId: string, planMonth: string): Promise<PlanOffDay[]> {
    const range = monthRange(planMonth);
    return this.source(userId, range.from, range.to);
  }

  async byDate(userId: string, from: string, to: string): Promise<Map<string, PlanOffDay>> {
    return new Map((await this.list(userId, from, to)).map((d) => [d.date, d]));
  }
}
