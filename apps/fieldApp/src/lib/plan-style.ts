import { Accents, type Accent } from '@/constants/theme';

import type { WorkingType } from './planning';

/** Each working type's colour on the Monthly Plan (calendar cells, day cards, legend). */
export const TYPE_ACCENT: Record<WorkingType, Accent> = {
  FIELD_WORK: 'green',
  MEETING: 'indigo',
  CONFERENCE: 'amber',
  STRIKE: 'red',
};

export const typeColors = (type: WorkingType) => Accents[TYPE_ACCENT[type]];
/** The weekly off day. */
export const OFF_COLORS = Accents.slate;
