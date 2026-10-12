import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { ApprovalKindDefinition, ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { Doctor } from '../../domain/doctor.entity.js';
import { DuplicateRecordError } from '../../domain/duplicateRecord.error.js';
import type { AssignedDoctor, AssignedScope, DoctorFilter, DoctorRepositoryPort } from '../../domain/doctor.repository.port.js';
import type { DoctorAssignment } from '../../domain/doctorAssignment.entity.js';
import type { DoctorAssignmentRepositoryPort } from '../../domain/doctorAssignment.repository.port.js';
import type { PageQuery } from '../../domain/masterStatus.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Distributor } from '../../domain/distributor.entity.js';
import type { DistributorFilter, DistributorRepositoryPort } from '../../domain/distributor.repository.port.js';
import type { SampleAllocation } from '../../domain/sampleAllocation.entity.js';
import type { SampleAllocationRepositoryPort } from '../../domain/sampleAllocation.repository.port.js';
import type { Product } from '../../domain/product.entity.js';
import type { ProductFilter, ProductRepositoryPort } from '../../domain/product.repository.port.js';
import type { Specialty } from '../../domain/specialty.entity.js';
import type { SpecialtyFilter, SpecialtyRepositoryPort } from '../../domain/specialty.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

/** In-memory fakes for Field Master Data's use-case tests — no Mongo, no other module's internals. */

const paged = <T>(rows: T[], f: { page: number; pageSize: number }): PaginatedResult<T> =>
  buildPaginatedResult(rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), rows.length, f);

export class FakeProducts implements ProductRepositoryPort {
  rows: Product[] = [];
  async listActive() {
    return this.rows.filter((p) => p.status === 'active');
  }
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
  async findByIds(ids: string[]) {
    return this.rows.filter((r) => ids.includes(r.id));
  }
  async listAllActive() {
    return this.rows.filter((r) => r.status === 'active');
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
  async listActiveOnRoutes(routeIds: string[]) {
    return this.rows.filter((c) => c.status === 'active' && routeIds.includes(c.routeId));
  }
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
  async findByIds(ids: string[]) {
    return this.rows.filter((r) => ids.includes(r.id));
  }
  async listAllActive() {
    return this.rows.filter((r) => r.status === 'active');
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
    ['route-3', 'active'],
    ['route-off', 'inactive'],
  ]);
  /** Where each Route sits: route-1 and route-2 share HQ h1 in zone z1; route-3 is elsewhere. */
  paths = new Map([
    ['route-1', { routeId: 'route-1', routeType: 'HQ' as const, hqId: 'h1', zoneId: 'z1' }],
    ['route-2', { routeId: 'route-2', routeType: 'HQ' as const, hqId: 'h1', zoneId: 'z1' }],
    ['route-3', { routeId: 'route-3', routeType: 'HQ' as const, hqId: 'h2', zoneId: 'z2' }],
  ]);
  async getRoutePath(routeId: string) {
    return this.paths.get(routeId) ?? null;
  }
  async listRouteIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }) {
    return [...this.paths.values()]
      .filter((p) => (scope.hqId ? p.hqId === scope.hqId : scope.zoneId ? p.zoneId === scope.zoneId : false))
      .map((p) => p.routeId);
  }
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
    if (await this.findActiveForDoctor(input.doctorId)) throw new DuplicateRecordError('active assignment');
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

/** A speciality list, with the starter names a test usually wants. */
export class FakeSpecialties implements SpecialtyRepositoryPort {
  rows: Specialty[] = [];
  private nextId = 1;
  constructor(names: string[] = ['General Physician', 'ENT', 'Cardiologist', 'Pediatrician']) {
    for (const name of names) this.rows.push({ id: `sp-${this.nextId++}`, name, status: 'active' });
  }
  async list(f: SpecialtyFilter) {
    const search = f.search?.toLowerCase();
    return paged(this.rows.filter((s) => (!f.status || s.status === f.status) && (!search || s.name.toLowerCase().includes(search))), f);
  }
  // Copies, like a database: a caller holding the old row must not see a later update through it.
  async findById(id: string) {
    const row = this.rows.find((s) => s.id === id);
    return row ? { ...row } : null;
  }
  async findByName(name: string) {
    const row = this.rows.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
    return row ? { ...row } : null;
  }
  async listActive() {
    return this.rows.filter((s) => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  }
  async create(input: { name: string }) {
    if (await this.findByName(input.name)) return null;
    const row: Specialty = { id: `sp-${this.nextId++}`, name: input.name, status: 'active' };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: { name?: string; status?: 'active' | 'inactive' }) {
    const row = this.rows.find((s) => s.id === id);
    if (!row) return null;
    if (change.name !== undefined) {
      const clash = await this.findByName(change.name);
      if (clash && clash.id !== id) return null;
      row.name = change.name;
    }
    if (change.status) row.status = change.status;
    return { ...row };
  }
  async addMissing(names: string[]) {
    let added = 0;
    for (const n of names) if (await this.create({ name: n })) added += 1;
    return added;
  }
}

export class FakeDoctors implements DoctorRepositoryPort {
  rows: Doctor[] = [];
  constructor(private readonly assignments: FakeAssignments) {}
  async renameSpecialty(from: string, to: string) {
    const hit = this.rows.filter((d) => d.specialty.trim().toLowerCase() === from.trim().toLowerCase());
    for (const d of hit) d.specialty = to;
    return hit.length;
  }
  async list(f: DoctorFilter) {
    const search = f.search?.toLowerCase();
    return paged(
      this.rows.filter(
        (d) =>
          (!f.routeId || d.routeId === f.routeId) &&
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
  /** Check and insert in one synchronous step, like the unique index does in Mongo. */
  async createProposed(input: Omit<Doctor, 'id'>) {
    if (this.rows.some((d) => d.addedBy === input.addedBy && d.clientRequestId !== null && d.clientRequestId === input.clientRequestId)) throw new DuplicateRecordError('client request');
    const row = { ...input, id: `doctor-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async findByClientRequest(addedBy: string, clientRequestId: string) {
    return this.rows.find((d) => d.addedBy === addedBy && d.clientRequestId === clientRequestId) ?? null;
  }
  async update(id: string, change: Partial<Omit<Doctor, 'id'>>) {
    const i = this.rows.findIndex((d) => d.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
  async listPendingAdded(addedBy: string) {
    return this.rows.filter((d) => d.addedBy === addedBy && d.status === 'pending');
  }
  async listAdded(addedBy: string, f: PageQuery) {
    return paged(this.rows.filter((d) => d.addedBy === addedBy).reverse(), f);
  }
  async listAssigned(scopes: AssignedScope[], f: Omit<DoctorFilter, 'status' | keyof PageQuery>, page: PageQuery | null) {
    const search = f.search?.toLowerCase();
    const items: AssignedDoctor[] = [];
    for (const d of this.rows) {
      const a = await this.assignments.findActiveForDoctor(d.id);
      const scope = scopes.find((s) => s.userId === a?.userId);
      if (!a || !scope || d.status !== 'active') continue;
      if (scope.routeIds !== null && !scope.routeIds.includes(d.routeId)) continue;
      if (f.routeId && d.routeId !== f.routeId) continue;
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

/** Stands in for the approval module: keeps one request per record and lets a test play the deciders. */
export class FakeApprovals implements ApprovalsPort {
  kinds = new Map<string, ApprovalKindDefinition>();
  requests: ApprovalRequest[] = [];
  registerKind(definition: ApprovalKindDefinition) {
    this.kinds.set(definition.kind, definition);
  }
  async submit(input: { kind: string; recordId: string; submitterId: string }) {
    const i = this.requests.findIndex((r) => r.kind === input.kind && r.recordId === input.recordId);
    if (i >= 0) {
      const again = { ...this.requests[i]!, status: 'SUBMITTED' as ApprovalStatus, cycle: this.requests[i]!.cycle + 1 };
      this.requests[i] = again;
      return again;
    }
    const request: ApprovalRequest = {
      id: `request-${this.requests.length + 1}`,
      kind: input.kind,
      recordId: input.recordId,
      submitterId: input.submitterId,
      status: 'SUBMITTED',
      workflow: 'MANAGER_THEN_FINAL',
      cycle: 1,
      submittedAt: new Date(),
      decidedAt: null,
      history: [],
    };
    this.requests.push(request);
    return request;
  }
  async getForRecord(kind: string, recordId: string) {
    return this.requests.find((r) => r.kind === kind && r.recordId === recordId) ?? null;
  }
  /** Moves the request to `status` and runs the kind's `onStatusChange`, as the approval module would. */
  async decide(kind: string, recordId: string, status: ApprovalStatus, actorId = 'admin') {
    const request = this.requests.find((r) => r.kind === kind && r.recordId === recordId)!;
    const previousStatus = request.status;
    request.status = status;
    request.history.push({ action: 'APPROVE', authority: 'FINAL', actorId, actorRole: 'ADMIN', comment: null, at: new Date(), resultingStatus: status, cycle: request.cycle });
    await this.kinds.get(kind)!.onStatusChange?.(
      { requestId: request.id, kind, recordId, submitterId: request.submitterId, previousStatus, status, action: request.history.at(-1)!, request },
      {},
    );
  }
}

export class FakeDistributors implements DistributorRepositoryPort {
  rows: Distributor[] = [];
  async listActiveForUser(userId: string, routeIds: string[]) {
    return this.rows.filter((d) => d.status === 'active' && (d.assignedUserIds.includes(userId) || d.routeIds.some((r) => routeIds.includes(r))));
  }
  async list(f: DistributorFilter) {
    const search = f.search?.toLowerCase();
    return paged(
      this.rows.filter(
        (d) =>
          (!f.routeIds || d.routeIds.some((r) => f.routeIds!.includes(r))) &&
          (!f.assignedUserId || d.assignedUserIds.includes(f.assignedUserId)) &&
          (!f.status || d.status === f.status) &&
          (!search || d.name.toLowerCase().includes(search) || d.gstNumber.toLowerCase().includes(search)),
      ),
      f,
    );
  }
  async findById(id: string) {
    return this.rows.find((d) => d.id === id) ?? null;
  }
  async findByIds(ids: string[]) {
    return this.rows.filter((r) => ids.includes(r.id));
  }
  async listAllActive() {
    return this.rows.filter((r) => r.status === 'active');
  }
  async create(input: Omit<Distributor, 'id'>) {
    const row = { ...input, id: `distributor-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: Partial<Omit<Distributor, 'id'>>) {
    const i = this.rows.findIndex((d) => d.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
}

export class FakeSampleAllocations implements SampleAllocationRepositoryPort {
  rows: SampleAllocation[] = [];
  async find(doctorId: string, productId: string) {
    return this.rows.find((a) => a.doctorId === doctorId && a.productId === productId) ?? null;
  }
  async findById(id: string) {
    return this.rows.find((a) => a.id === id) ?? null;
  }
  async listForDoctor(doctorId: string) {
    return this.rows.filter((a) => a.doctorId === doctorId);
  }
  async listForDoctors(doctorIds: string[]) {
    return this.rows.filter((a) => doctorIds.includes(a.doctorId));
  }
  async issue(i: { doctorId: string; productId: string; quantity: number; by: string }) {
    const row = await this.find(i.doctorId, i.productId);
    if (row) {
      Object.assign(row, { quantityAllocated: row.quantityAllocated + i.quantity, quantityRemaining: row.quantityRemaining + i.quantity, allocatedBy: i.by });
      return row;
    }
    const created: SampleAllocation = { id: `allocation-${this.rows.length + 1}`, doctorId: i.doctorId, productId: i.productId, quantityAllocated: i.quantity, quantityRemaining: i.quantity, allocatedBy: i.by, allocatedAt: new Date() };
    this.rows.push(created);
    return created;
  }
  async setAllocated(i: { doctorId: string; productId: string; total: number; by: string }) {
    const row = await this.find(i.doctorId, i.productId);
    const given = row ? row.quantityAllocated - row.quantityRemaining : 0;
    if (!row || given > i.total) return null;
    Object.assign(row, { quantityAllocated: i.total, quantityRemaining: i.total - given, allocatedBy: i.by });
    return row;
  }
  async restoreRemaining(id: string, quantity: number) {
    const row = this.rows.find((a) => a.id === id);
    if (row) row.quantityRemaining += quantity;
  }
  /** One synchronous check-and-take, like the conditional update in Mongo. */
  async decrementRemaining(id: string, quantity: number) {
    const row = this.rows.find((a) => a.id === id);
    if (!row || row.quantityRemaining < quantity) return false;
    row.quantityRemaining -= quantity;
    return true;
  }
}
