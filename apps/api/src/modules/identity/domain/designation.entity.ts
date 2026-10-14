export const DESIGNATION_NAMES = ['MR', 'ASM', 'RSM', 'ZSM', 'NSM'] as const;
export type DesignationName = (typeof DESIGNATION_NAMES)[number];

/** Rank in the reporting chain, fixed by the name: a lower level reports up to a higher one. Not typed in by anyone. */
export const DESIGNATION_LEVEL: Record<DesignationName, number> = { MR: 1, ASM: 2, RSM: 3, ZSM: 4, NSM: 5 };

export interface Designation {
  id: string;
  name: DesignationName;
  /** `DESIGNATION_LEVEL[name]`. */
  level: number;
}

/** A manager is anyone whose designation is above MR, whether or not anyone reports to them yet. */
export const isManagerLevel = (level: number): boolean => level > DESIGNATION_LEVEL.MR;
