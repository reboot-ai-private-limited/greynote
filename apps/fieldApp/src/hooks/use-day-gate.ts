import { useEffect, useState } from 'react';

import type { Feature } from '@/features/catalog';
import { useCachedSource } from '@/offline/cache';
import { businessToday, computeDayGate, type DayGate } from '@/offline/day';
import type { ConfigSnapshot, FieldActivitySnapshot, PlanningSnapshot } from '@/types/sync';

/** Re-evaluated each minute so "today" rolls over at midnight without a restart. */
function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

/** Today's date and whether today's calls and expenses are open, from the last pull. */
export function useDayGate(): DayGate & { today: string } {
  useMinuteTick();
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const config = useCachedSource<ConfigSnapshot>('config');

  const today = businessToday(config.data?.settings.BUSINESS_TIMEZONE, new Date(), config.data?.settings.DAY_START_TIME);
  const gate = computeDayGate({
    today,
    plans: planning.data?.dailyPlans ?? null,
    blocked: activity.data?.blocked ?? null,
    monthlyPlans: planning.data?.monthlyPlans ?? null,
  });
  return { ...gate, today };
}

/** Why a tile is locked right now, or null if it is open. */
export function lockReason(feature: Feature, gate: DayGate): string | null {
  if (feature.gate === 'none') return null;
  if (gate.state === 'blocked' || gate.state === 'unknown') return gate.reason;
  if (feature.gate === 'plan' && gate.state === 'closed') return gate.reason;
  return null;
}
