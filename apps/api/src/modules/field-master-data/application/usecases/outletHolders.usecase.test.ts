import { beforeEach, describe, expect, it } from 'vitest';
import type { ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import { assignAfterCreate } from '../assignAfterCreate.js';
import { makeChemistApprovalHandler } from '../chemistApproval.js';
import { OutletHolders } from '../outletHolders.js';
import { AssignChemistUseCase } from './chemistAssignments.usecase.js';
import { CreateChemistUseCase } from './createChemist.usecase.js';
import { FakeChemistAssignments, FakeChemists, FakeConfig, FakeTerritory, FakeUsers } from './fmdTestKit.js';

const chemist = (id: string, over: Partial<Chemist> = {}): Chemist => ({
  id, placeId: 'p-route-1', routeId: 'route-1', name: id, address: 'x', phone: null, location: null, capturedLocation: null, status: 'active', addedBy: null, clientRequestId: null, approvedAt: null, ...over,
});
const approved = (recordId: string) => ({ status: 'APPROVED', recordId, request: { history: [] } }) as unknown as ApprovalStatusChange;

describe('who holds doctors and chemists (2026-11-27)', () => {
  let users: FakeUsers;
  let config: FakeConfig;
  let chemists: FakeChemists;
  let assignments: FakeChemistAssignments;
  let holders: OutletHolders;
  let assign: AssignChemistUseCase;

  beforeEach(() => {
    users = new FakeUsers();
    config = new FakeConfig();
    chemists = new FakeChemists();
    chemists.rows.push(chemist('c1'), chemist('c2', { status: 'pending', addedBy: 'asm' }), chemist('c3', { status: 'pending', addedBy: 'mr1' }));
    assignments = new FakeChemistAssignments();
    holders = new OutletHolders(users, config);
    assign = new AssignChemistUseCase(chemists, assignments, users, holders);
  });

  it('a manager is refused as a holder unless MANAGERS_CAN_HOLD_OUTLETS is on; an MR always can', async () => {
    await expect(assign.execute('c1', 'asm', 'admin')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Managers don’t hold chemists') });
    await assign.execute('c1', 'mr1', 'admin');
    config.values.set('MANAGERS_CAN_HOLD_OUTLETS', 'true');
    await assign.execute('c1', 'asm', 'admin');
    expect((await assignments.listActiveForChemist('c1')).map((a) => a.userId).sort()).toEqual(['asm', 'mr1']);
  });

  it('approving a chemist assigns its MR when AUTO_ASSIGN_CHEMIST_ON_APPROVAL is on, never a manager by default', async () => {
    const handler = makeChemistApprovalHandler(chemists, assignments, { users, config, holders });
    await handler(approved('c3'), {});
    await handler(approved('c2'), {});
    expect((await assignments.listActiveForChemist('c3')).map((a) => a.userId)).toEqual(['mr1']);
    expect(await assignments.listActiveForChemist('c2')).toEqual([]);

    chemists.rows.push(chemist('c4', { status: 'pending', addedBy: 'mr2' }));
    config.values.set('AUTO_ASSIGN_CHEMIST_ON_APPROVAL', 'false');
    await handler(approved('c4'), {});
    expect(await assignments.listActiveForChemist('c4')).toEqual([]);
  });

  it('office staff can pick the MR when adding; a refused pick keeps the record and says why', async () => {
    const create = new CreateChemistUseCase(chemists, new FakeTerritory(), (id, userId, adminId) => assign.execute(id, userId, adminId));
    const held = await create.execute({ name: 'Sai Pharmacy', address: 'Hill Cart Rd', location: null, routeId: 'route-1', assignToUserId: 'mr1' }, 'admin');
    expect(held.assignError).toBeNull();
    expect((await assignments.listActiveForChemist(held.id)).map((a) => a.userId)).toEqual(['mr1']);
    const refused = await create.execute({ name: 'Zen Medico', address: 'Sevoke Rd', location: null, routeId: 'route-1', assignToUserId: 'asm' }, 'admin');
    expect(refused.assignError).toContain('Managers don’t hold chemists');
    expect(chemists.rows.some((c) => c.id === refused.id)).toBe(true);
    expect(await assignAfterCreate(undefined, 'x', 'mr1', 'admin')).toBeNull();
  });
});
