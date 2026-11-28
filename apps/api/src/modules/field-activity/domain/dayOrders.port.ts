/** Sales sits above Field Activity: the composition root hands it "this employee's orders placed on this day" (2026-11-28, the daily report's Orders). */
export interface DayOrder {
  id: string;
  outlet: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string };
  status: string;
  totalAmountPaise: number;
  remarks: string | null;
  items: Array<{ productId: string; quantity: number; amountPaise: number }>;
}
export type DayOrdersPort = (userId: string, date: string) => Promise<DayOrder[]>;
