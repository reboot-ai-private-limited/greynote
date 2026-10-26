/** What Sales holds against a distributor, counted and erased through its contract; bound by the composition root. */
export interface DistributorReferences {
  payments: number;
  orders: number;
  /** Of `orders`, those still placed. */
  openOrders: number;
  monthlyStock: number;
  stockStatements: number;
}

export const NO_DISTRIBUTOR_REFERENCES: DistributorReferences = { payments: 0, orders: 0, openOrders: 0, monthlyStock: 0, stockStatements: 0 };

export interface DistributorReferencesPort {
  count(distributorId: string): Promise<DistributorReferences>;
  /** Deletes all of it and says how much there was. Safe to run again. */
  erase(distributorId: string): Promise<DistributorReferences>;
}
