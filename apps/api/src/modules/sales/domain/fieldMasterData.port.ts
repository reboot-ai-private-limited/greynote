/** Sales' narrow view of Field Master Data; `fieldMasterData.contract` satisfies it structurally. */
export interface FieldMasterDataPort {
  getChemist(id: string): Promise<{ id: string; name: string; status: 'active' | 'inactive' } | null>;
  getDistributor(id: string): Promise<{ id: string; name: string; status: 'active' | 'inactive' } | null>;
  getProduct(id: string): Promise<{ id: string; name: string; status: 'active' | 'inactive' } | null>;
  /** Every active Product, with the prices a stock statement values with. */
  listActiveProducts(): Promise<Array<{ id: string; name: string; sku: string; ptsPaise: number | null; ptrPaise: number | null }>>;
  canActOnChemist(userId: string, chemistId: string): Promise<boolean>;
  canActOnDistributor(userId: string, distributorId: string): Promise<boolean>;
  listOutletsForUser(userId: string): Promise<{ chemists: Array<{ id: string; name: string }>; distributors: Array<{ id: string; name: string }> }>;
}
