import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { makeChemistApprovalHandler, NEW_CHEMIST_KIND } from '../chemistApproval.js';
import { AddedChemists, type AddedChemistInput } from './addedChemists.js';
import { FakeApprovals, FakeChemists, FakeConfig, FakeTerritory, FakeTransactions, FakeUsers } from './fmdTestKit.js';

const page = { page: 1, pageSize: 20 };
const phoneGps = { latitude: 26.71, longitude: 88.41 };
const input: AddedChemistInput = { routeId: 'route-1', name: 'Sai Pharmacy', address: '4 Market Rd', location: phoneGps };

describe('An employee adds a Chemist', () => {
  let chemists: FakeChemists;
  let approvals: FakeApprovals;
  let territory: FakeTerritory;
  let users: FakeUsers;
  let config: FakeConfig;
  let added: AddedChemists;

  const add = (over: Partial<AddedChemistInput & { clientRequestId: string }> = {}, who = 'mr1') =>
    added.add(who, { ...input, clientRequestId: 'client-req-0001', ...over });

  beforeEach(() => {
    chemists = new FakeChemists();
    approvals = new FakeApprovals();
    territory = new FakeTerritory();
    users = new FakeUsers();
    config = new FakeConfig();
    territory.userRoutes.set('mr1', ['route-1']);
    territory.userRoutes.set('mr2', ['route-2']);
    territory.userRoutes.set('asm', ['route-1']);
    added = new AddedChemists(chemists, territory, approvals, new FakeTransactions(), users, config);
    approvals.registerKind({ kind: NEW_CHEMIST_KIND, finalApproverRoles: ['ADMIN'], onStatusChange: makeChemistApprovalHandler(chemists) });
  });

  it('creates it pending with the phone location, and submits it for approval', async () => {
    const { chemist, created } = await add();
    expect(created).toBe(true);
    expect(chemist).toMatchObject({ status: 'pending', addedBy: 'mr1', approvedAt: null, location: phoneGps, capturedLocation: phoneGps, approval: { status: 'SUBMITTED' } });
    expect(approvals.requests[0]).toMatchObject({ kind: NEW_CHEMIST_KIND, recordId: chemist.id, submitterId: 'mr1' });
  });

  it('is not usable until approved, then becomes active', async () => {
    const { chemist } = await add();
    expect(await chemists.listActiveOnRoutes(['route-1'])).toEqual([]);
    await approvals.decide(NEW_CHEMIST_KIND, chemist.id, 'APPROVED');
    expect((await chemists.findById(chemist.id))!.status).toBe('active');
    expect(await chemists.listActiveOnRoutes(['route-1'])).toHaveLength(1);
    await approvals.decide(NEW_CHEMIST_KIND, chemist.id, 'REOPENED');
    expect((await chemists.findById(chemist.id))).toMatchObject({ status: 'pending', approvedAt: null });
  });

  it('returns the earlier Chemist on a retry with the same clientRequestId', async () => {
    const first = await add();
    const again = await add({ name: 'Renamed' });
    expect(again.created).toBe(false);
    expect(again.chemist.id).toBe(first.chemist.id);
    expect(chemists.rows).toHaveLength(1);
    expect(approvals.requests).toHaveLength(1);
  });

  it('refuses a Route the employee does not have', async () => {
    await expect(add({ routeId: 'route-2' })).rejects.toMatchObject({ statusCode: 400 });
    expect(chemists.rows).toHaveLength(0);
  });

  describe('the manager toggle', () => {
    it('refuses a manager while MANAGER_CAN_ADD_CHEMISTS is off, even if managers may add doctors', async () => {
      config.values.set('MANAGER_CAN_ADD_DOCTORS', 'true');
      await expect(add({}, 'asm')).rejects.toMatchObject({ statusCode: 403 });
      expect(chemists.rows).toHaveLength(0);
    });

    it('refuses when the key is missing from Config (not yet seeded)', async () => {
      config.get = async (key: string) => {
        if (!config.values.has(key)) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key });
        return config.values.get(key)!;
      };
      await expect(add({}, 'asm')).rejects.toMatchObject({ statusCode: 403 });
    });

    it('lets a manager add once Admin turns it on, and always lets an employee without a team add', async () => {
      config.values.set('MANAGER_CAN_ADD_CHEMISTS', 'true');
      await expect(add({}, 'asm')).resolves.toMatchObject({ created: true });
      config.values.set('MANAGER_CAN_ADD_CHEMISTS', 'false');
      await expect(add({ clientRequestId: 'client-req-0002' }, 'mr1')).resolves.toMatchObject({ created: true });
    });

    it('still returns a manager’s earlier Chemist on a retry after the toggle goes off', async () => {
      config.values.set('MANAGER_CAN_ADD_CHEMISTS', 'true');
      await add({}, 'asm');
      config.values.set('MANAGER_CAN_ADD_CHEMISTS', 'false');
      await expect(add({}, 'asm')).resolves.toMatchObject({ created: false });
    });
  });

  it('lists only the Chemists this employee added, with their approval', async () => {
    await add();
    territory.userRoutes.set('mr2', ['route-1']);
    await add({ clientRequestId: 'client-req-0009' }, 'mr2');
    const mine = await added.list('mr1', page);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ addedBy: 'mr1', approval: { status: 'SUBMITTED' } });
  });

  it('lets the employee fix and resubmit only after a rejection', async () => {
    const { chemist } = await add();
    await expect(added.edit('mr1', chemist.id, { ...input, name: 'New name' })).rejects.toMatchObject({ statusCode: 409 });
    await approvals.decide(NEW_CHEMIST_KIND, chemist.id, 'REJECTED');
    const edited = await added.edit('mr1', chemist.id, { ...input, name: 'New name' });
    expect(edited).toMatchObject({ name: 'New name', status: 'pending', approval: { status: 'SUBMITTED', cycle: 2 } });
    await expect(added.edit('mr2', chemist.id, input)).rejects.toMatchObject({ statusCode: 404 });
  });
});
