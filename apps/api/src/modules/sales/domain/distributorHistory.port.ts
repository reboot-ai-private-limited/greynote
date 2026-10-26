/** What Sales holds against one distributor. The distributor's own record lives in Field Master Data; this is the history that hangs off it. */
export interface DistributorHistory {
  payments: number;
  orders: number;
  /** Of `orders`, those still `PLACED` — not yet delivered or cancelled. */
  openOrders: number;
  monthlyStock: number;
  stockStatements: number;
}

export interface DistributorHistoryPort {
  count(distributorId: string): Promise<DistributorHistory>;
  /** Deletes all of it and says how much there was. Safe to run again: a second run finds nothing and deletes nothing. */
  erase(distributorId: string): Promise<DistributorHistory>;
}
