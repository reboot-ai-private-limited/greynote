export const DESIGNATION_NAMES = ['MR', 'ASM', 'RSM', 'ZSM', 'NSM'] as const;
export type DesignationName = (typeof DESIGNATION_NAMES)[number];

export interface Designation {
  id: string;
  name: DesignationName;
  /** Rank order, used to validate the reporting chain. */
  level: number;
}
