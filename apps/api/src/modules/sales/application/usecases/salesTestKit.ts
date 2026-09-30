import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';

/** In-memory fakes for Sales' use-case tests — no Mongo, no other module's internals. */

// mr1 covers chem1 + dist1, mr2 covers chem2; asm manages both.
export class FakeMaster implements FieldMasterDataPort {
  private active = { status: 'active' as const };
  outlets: Record<string, { chemists: string[]; distributors: string[] }> = { mr1: { chemists: ['chem1'], distributors: ['dist1'] }, mr2: { chemists: ['chem2'], distributors: [] }, asm: { chemists: [], distributors: [] } };
  inactiveProducts = new Set<string>();
  async getChemist(id: string) {
    return ['chem1', 'chem2'].includes(id) ? { id, name: id, ...this.active } : null;
  }
  async getDistributor(id: string) {
    return id === 'dist1' ? { id, name: id, ...this.active } : null;
  }
  async getProduct(id: string) {
    return id.startsWith('prod') ? { id, name: id, status: this.inactiveProducts.has(id) ? ('inactive' as const) : ('active' as const) } : null;
  }
  async canActOnChemist(u: string, id: string) {
    return this.outlets[u]?.chemists.includes(id) ?? false;
  }
  async canActOnDistributor(u: string, id: string) {
    return this.outlets[u]?.distributors.includes(id) ?? false;
  }
  async listOutletsForUser(u: string) {
    const o = this.outlets[u] ?? { chemists: [], distributors: [] };
    return { chemists: o.chemists.map((id) => ({ id, name: id })), distributors: o.distributors.map((id) => ({ id, name: id })) };
  }
}

export class FakeUsers implements UserDirectoryPort {
  private u = (id: string): DirectoryUser => ({ id, name: id, employeeCode: id, role: id === 'admin' ? 'ADMIN' : 'FIELD', status: 'active' });
  async getUserSummaries(ids: string[]) {
    return ids.map(this.u);
  }
  async getDownline(m: string) {
    return m === 'asm' ? [this.u('mr1'), this.u('mr2')] : [];
  }
  async listActiveFieldUserIds() {
    return ['asm', 'mr1', 'mr2'];
  }
}

export const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', MONTHLY_STOCK_GRACE_DAYS: '0' })[key] ?? '' };
