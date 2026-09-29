import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import type { AssignedDoctor, AssignedScope, DoctorFilter, DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignment } from '../../domain/doctorAssignment.entity.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { PageQuery } from '../../domain/masterStatus.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Product } from '../../domain/product.entity.js';
import type { ProductFilter, ProductRepositoryPort } from '../../domain/product.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

/** In-memory fakes for Field Master Data's use-case tests — no Mongo, no other module's internals. */

const paged = <T>(rows: T[], f: { page: number; pageSize: number }): PaginatedResult<T> =>
  buildPaginatedResult(rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), rows.length, f);

export class FakeProducts implements ProductRepositoryPort {
  rows: Product[] = [];
  private taken(sku: string, exceptId?: string) {
    return this.rows.some((p) => p.id !== exceptId && p.sku.trim().toLowerCase() === sku.trim().toLowerCase());
  }
  async list(f: ProductFilter) {
    const search = f.search?.toLowerCase();
    return paged(
      this.rows.filter(
        (p) =>
          (!f.category || p.category === f.category) &&
          (!f.status || p.status === f.status) &&
          (!search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search)),
      ),
      f,
    );
  }
  async findById(id: string) {
    return this.rows.find((p) => p.id === id) ?? null;
  }
  async create(input: Omit<Product, 'id'>) {
    if (this.taken(input.sku)) return null;
    const row = { ...input, id: `product-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: Partial<Omit<Product, 'id'>>) {
    if (change.sku !== undefined && this.taken(change.sku, id)) return null;
    const i = this.rows.findIndex((p) => p.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
}

export class FakeChemists implements ChemistRepositoryPort {
  rows: Chemist[] = [];
  async list(f: ChemistFilter) {
    const search = f.search?.toLowerCase();
    return paged(
      this.rows.filter(
        (c) =>
          (!f.routeId || c.routeId === f.routeId) &&
          (!f.status || c.status === f.status) &&
          (!search || c.name.toLowerCase().includes(search)),
      ),
      f,
    );
  }
  async findById(id: string) {
    return this.rows.find((c) => c.id === id) ?? null;
  }
  async create(input: Omit<Chemist, 'id'>) {
    const row = { ...input, id: `chemist-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: Partial<Omit<Chemist, 'id'>>) {
    const i = this.rows.findIndex((c) => c.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
}

export class FakeTerritory implements TerritoryPort {
  routes = new Map<string, 'active' | 'inactive'>([
    ['route-1', 'active'],
    ['route-2', 'active'],
    ['route-off', 'inactive'],
  ]);
  /** The Routes each user currently has. */
  userRoutes = new Map<string, string[]>();
  async getRoute(routeId: string) {
    const status = this.routes.get(routeId);
    return status ? { id: routeId, status } : null;
  }
  async listRoutesForUser(userId: string) {
    return (this.userRoutes.get(userId) ?? []).map((id) => ({ id }));
  }
}

export class FakeUsers implements UserDirectoryPort {
  rows: DirectoryUser[] = [
    { id: 'admin', name: 'Admin', employeeCode: 'A1', role: 'ADMIN', status: 'active' },
    { id: 'mr1', name: 'Asha MR', employeeCode: 'E1', role: 'FIELD', status: 'active' },
    { id: 'mr2', name: 'Ben MR', employeeCode: 'E2', role: 'FIELD', status: 'active' },
    { id: 'asm', name: 'Chitra ASM', employeeCode: 'E3', role: 'FIELD', status: 'active' },
    { id: 'gone', name: 'Left MR', employeeCode: 'E4', role: 'FIELD', status: 'inactive' },
    { id: 'stranger', name: 'Stranger', employeeCode: 'E5', role: 'FIELD', status: 'active' },
  ];
  /** manager → everyone below them. */
  downline = new Map<string, string[]>([['asm', ['mr1', 'mr2']]]);
  async findUserSummary(id: string) {
    return this.rows.find((u) => u.id === id) ?? null;
  }
  async getUserSummaries(ids: string[]) {
    return this.rows.filter((u) => ids.includes(u.id));
  }
  async getDownline(managerId: string) {
    return this.rows.filter((u) => (this.downline.get(managerId) ?? []).includes(u.id));
  }
}

export class FakeAssignments implements DoctorAssignmentRepositoryPort {
  rows: DoctorAssignment[] = [];
  async findActiveForDoctor(doctorId: string) {
    return this.rows.find((a) => a.doctorId === doctorId && a.status === 'active') ?? null;
  }
  async findActiveForDoctors(doctorIds: string[]) {
    return this.rows.filter((a) => a.status === 'active' && doctorIds.includes(a.doctorId));
  }
  async listForDoctor(doctorId: string) {
    return this.rows.filter((a) => a.doctorId === doctorId).reverse();
  }
  async endActive(doctorId: string, by: string) {
    for (const a of this.rows) if (a.doctorId === doctorId && a.status === 'active') Object.assign(a, { status: 'inactive', unassignedAt: new Date(), unassignedBy: by });
  }
  async create(input: { doctorId: string; userId: string; assignedBy: string }) {
    if (await this.findActiveForDoctor(input.doctorId)) return null;
    const row: DoctorAssignment = { ...input, id: `assignment-${this.rows.length + 1}`, status: 'active', assignedAt: new Date(), unassignedAt: null, unassignedBy: null };
    this.rows.push(row);
    return row;
  }
  async endActiveIfUser(doctorId: string, userId: string, by: string) {
    const a = await this.findActiveForDoctor(doctorId);
    if (a?.userId !== userId) return false;
    await this.endActive(doctorId, by);
    return true;
  }
}

export class FakeDoctors implements DoctorRepositoryPort {
  rows: Doctor[] = [];
  constructor(private readonly assignments: FakeAssignments) {}
  async list(f: DoctorFilter) {
    const search = f.search?.toLowerCase();
    return paged(
      this.rows.filter(
        (d) =>
          (!f.routeId || d.routeId === f.routeId) &&
          (!f.category || d.category === f.category) &&
          (!f.status || d.status === f.status) &&
          (!search || d.name.toLowerCase().includes(search)),
      ),
      f,
    );
  }
  async findById(id: string) {
    return this.rows.find((d) => d.id === id) ?? null;
  }
  async create(input: Omit<Doctor, 'id'>) {
    const row = { ...input, id: `doctor-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: Partial<Omit<Doctor, 'id'>>) {
    const i = this.rows.findIndex((d) => d.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
  async listAssigned(scopes: AssignedScope[], f: Omit<DoctorFilter, 'status' | keyof PageQuery>, page: PageQuery | null) {
    const search = f.search?.toLowerCase();
    const items: AssignedDoctor[] = [];
    for (const d of this.rows) {
      const a = await this.assignments.findActiveForDoctor(d.id);
      const scope = scopes.find((s) => s.userId === a?.userId);
      if (!a || !scope || d.status !== 'active') continue;
      if (scope.routeIds !== null && !scope.routeIds.includes(d.routeId)) continue;
      if ((f.routeId && d.routeId !== f.routeId) || (f.category && d.category !== f.category)) continue;
      if (search && !d.name.toLowerCase().includes(search)) continue;
      items.push({ ...d, assignedUserId: a.userId });
    }
    items.sort((x, y) => x.name.localeCompare(y.name));
    return { items: page ? items.slice((page.page - 1) * page.pageSize, page.page * page.pageSize) : items, total: items.length };
  }
}

export class FakeConfig implements ConfigReader {
  values = new Map<string, string>([['DOCTOR_VISIBILITY_FOLLOWS_ROUTE', 'true']]);
  async get(key: string) {
    return this.values.get(key) ?? '';
  }
}

export class FakeTransactions implements TransactionRunnerPort {
  async run<T>(fn: (ctx: unknown) => Promise<T>) {
    return fn({});
  }
}
