import type { Outlet } from '../domain/monthlyStock.entity.js';
import type { FieldMasterDataPort } from '../domain/fieldMasterData.port.js';
import { STOCK_CODES, StockRefusal } from '../domain/stockRefusal.js';

export interface Actor {
  id: string;
  role: string;
}

/** Who may act on a Chemist or Distributor: it must exist and be active; an MR must have it on their Routes; Admin any. Shared by stock and Orders. */
export class OutletAccess {
  constructor(private readonly master: FieldMasterDataPort) {}

  async assertUsable(actor: Actor, outlet: Outlet): Promise<void> {
    const found = outlet.type === 'CHEMIST' ? await this.master.getChemist(outlet.id) : await this.master.getDistributor(outlet.id);
    if (!found || found.status !== 'active') throw new StockRefusal(STOCK_CODES.outletNotFound, 'That outlet does not exist or is no longer active.');
    if (actor.role === 'ADMIN') return;
    const allowed = outlet.type === 'CHEMIST' ? await this.master.canActOnChemist(actor.id, outlet.id) : await this.master.canActOnDistributor(actor.id, outlet.id);
    if (!allowed) throw new StockRefusal(STOCK_CODES.outletNotYours, 'That outlet is not on your Routes.');
  }
}
