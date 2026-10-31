import { beforeEach, describe, expect, it } from 'vitest';
import { NEW_CHEMIST_REASON_CODES, SYNC_RECORD_KINDS, type NewChemistPayload } from '@greynote/contracts';
import { SyncRejection } from '@/modules/sync/sync.public.js';
import { makeNewChemistSyncHandler, NEW_CHEMIST_SYNC_CODES, NEW_CHEMIST_SYNC_KIND } from '../application/newChemistSync.js';
import { AddedChemists } from '../application/usecases/addedChemists.js';
import { FakeApprovals, FakeChemists, FakeConfig, FakeTerritory, FakeTransactions, FakeUsers } from '../application/usecases/fmdTestKit.js';
import { editAddedChemistBodySchema } from './field-master-data.schemas.js';

const ROUTE = 'a'.repeat(24);
const OTHER_ROUTE = 'b'.repeat(24);
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const payload = (over: Record<string, unknown> = {}) => ({ routeId: ROUTE, name: 'Sai Pharmacy', address: '4 Market Rd', location: { latitude: 26.71, longitude: 88.41 }, ...over });

describe('NEW_CHEMIST through the sync push', () => {
  let chemists: FakeChemists;
  let approvals: FakeApprovals;
  let config: FakeConfig;
  let handler: ReturnType<typeof makeNewChemistSyncHandler>;
  const run = (p: unknown, who = 'mr1', clientId = CLIENT_ID) => handler.apply({ userId: who, clientId, clientCreatedAt: new Date(), payload: p }, {});
  const refusal = async (p: unknown, who = 'mr1') => {
    const err = await run(p, who).then(() => undefined, (e: unknown) => e);
    expect(err).toBeInstanceOf(SyncRejection);
    return err as SyncRejection;
  };

  beforeEach(() => {
    chemists = new FakeChemists();
    approvals = new FakeApprovals();
    const territory = new FakeTerritory();
    territory.userRoutes.set('mr1', [ROUTE]);
    territory.userRoutes.set('asm', [ROUTE]);
    config = new FakeConfig();
    handler = makeNewChemistSyncHandler(new AddedChemists(chemists, territory, approvals, new FakeTransactions(), new FakeUsers(), config), (p) => editAddedChemistBodySchema.parse(p));
  });

  it('is the NEW_CHEMIST kind, and the contract agrees on the kind, the codes and the payload', () => {
    expect(handler.kind).toBe('NEW_CHEMIST');
    expect(SYNC_RECORD_KINDS).toContain(NEW_CHEMIST_SYNC_KIND);
    expect([...NEW_CHEMIST_REASON_CODES].sort()).toEqual(Object.values(NEW_CHEMIST_SYNC_CODES).sort());
    const typed: NewChemistPayload = payload();
    expect(editAddedChemistBodySchema.parse(typed)).toMatchObject({ name: 'Sai Pharmacy' });
  });

  it('creates the Chemist pending with the phone’s location and sends it for approval', async () => {
    const { serverId } = await run(payload());
    expect(chemists.rows.find((c) => c.id === serverId)).toMatchObject({ status: 'pending', addedBy: 'mr1', clientRequestId: CLIENT_ID, capturedLocation: { latitude: 26.71, longitude: 88.41 } });
    expect(approvals.requests[0]).toMatchObject({ kind: 'NEW_CHEMIST', recordId: serverId, status: 'SUBMITTED' });
  });

  it('never makes two from the same client id', async () => {
    const first = await run(payload());
    expect((await run(payload({ name: 'Renamed' }))).serverId).toBe(first.serverId);
    expect(chemists.rows).toHaveLength(1);
  });

  it('refuses a payload without a location, a Route the employee lost, and a manager while the toggle is off', async () => {
    expect((await refusal(payload({ location: undefined }))).code).toBe('INVALID_PAYLOAD');
    expect((await refusal(payload({ routeId: OTHER_ROUTE }))).code).toBe('ROUTE_NOT_ASSIGNED');
    expect((await refusal(payload(), 'asm')).code).toBe('MANAGER_NOT_ALLOWED');
    config.values.set('MANAGER_CAN_ADD_CHEMISTS', 'true');
    await expect(run(payload(), 'asm')).resolves.toHaveProperty('serverId');
  });
});
