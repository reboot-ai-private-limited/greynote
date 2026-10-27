/** Sales' narrow view of Field Master Data; `fieldMasterData.contract` satisfies it structurally. */
export interface FieldMasterDataPort {
  getChemist(id: string): Promise<{ id: string; name: string; status: 'active' | 'inactive' } | null>;
  getDistributor(id: string): Promise<{ id: string; name: string; status: 'active' | 'inactive'; openingDuesPaise?: number; address?: string | null; gstNumber?: string | null; mobile?: string | null } | null>;
  /** Every distributor's opening dues added up. */
  sumOpeningDues(): Promise<number>;
  getProduct(id: string): Promise<{ id: string; name: string; sku: string; mrpPaise: number | null; status: 'active' | 'inactive'; ptsPaise: number | null; ptrPaise: number | null; gstPercent: number | null } | null>;
  /** Every active Product, with the prices a stock statement values with. */
  listActiveProducts(): Promise<Array<{ id: string; name: string; sku: string; ptsPaise: number | null; ptrPaise: number | null }>>;
  canActOnChemist(userId: string, chemistId: string): Promise<boolean>;
  canActOnDistributor(userId: string, distributorId: string): Promise<boolean>;
  listOutletsForUser(userId: string): Promise<{ chemists: Array<{ id: string; name: string }>; distributors: Array<{ id: string; name: string }> }>;
}
