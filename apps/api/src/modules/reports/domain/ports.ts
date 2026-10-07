/** Reports' narrow views of the modules below it; their public contracts satisfy these structurally. */
export interface OrderRecord {
  id: string;
  userId: string;
  outlet: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string };
  orderDate: string;
  status: 'PLACED' | 'DONE' | 'CANCELLED';
  totalAmountPaise: number;
  remarks: string | null;
  items: Array<{ productId: string; quantity: number; unitPricePaise: number; amountPaise: number }>;
  completedBy: string | null;
  completedAt: Date | null;
}

export interface SalesPort {
  listOrders(filter: { from?: string; to?: string; status?: 'PLACED' | 'DONE' | 'CANCELLED'; userId?: string; limit?: number }): Promise<OrderRecord[]>;
  getOrder(orderId: string): Promise<OrderRecord | null>;
}

export interface MasterPort {
  listNames(query: { distributorIds?: string[]; chemistIds?: string[]; productIds?: string[] }): Promise<{
    distributors: Array<{ id: string; name: string }>;
    chemists: Array<{ id: string; name: string }>;
    products: Array<{ id: string; name: string; sku: string }>;
  }>;
}

export interface IdentityPort {
  getUserSummaries(userIds: string[]): Promise<Array<{ id: string; name: string; employeeCode: string }>>;
}
