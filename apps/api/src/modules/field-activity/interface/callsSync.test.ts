import { beforeEach, describe, expect, it } from 'vitest';
import {
  DCR_REFUSAL_CODES,
  SYNC_RECORD_KINDS,
  type ChemistCallPayload,
  type ChemistFollowupPayload,
  type DoctorCallPayload,
  type DoctorFollowupPayload,
} from '@greynote/contracts';
import { SyncRejection } from '@/modules/sync/sync.public.js';
import { CHEMIST_CALL_SYNC_KIND, CHEMIST_FOLLOWUP_SYNC_KIND, DOCTOR_CALL_SYNC_KIND, DOCTOR_FOLLOWUP_SYNC_KIND, makeCallSyncHandlers } from '../application/callsSync.js';
import { DCR_SUBMIT_SYNC_KIND } from '../application/dcrSubmitSync.js';
import { faKit, Tx } from '../application/usecases/faTestKit.js';
import { GATE_CODES } from '../domain/gateRefusal.js';
import { LOG_CODES } from '../domain/logRefusal.js';
import { chemistCallPayloadSchema, chemistFollowupPayloadSchema, doctorCallPayloadSchema, doctorFollowupPayloadSchema } from './field-activity.schemas.js';

const oid = (c: string) => c.repeat(24);
const DAY = '2026-10-05';
const gps = { latitude: 26.7271, longitude: 88.3953 };

describe('the day’s records against the shared contract', () => {
  it('the kinds and the refusal codes are the contract’s, value for value', () => {
    expect([DOCTOR_CALL_SYNC_KIND, CHEMIST_CALL_SYNC_KIND, DOCTOR_FOLLOWUP_SYNC_KIND, CHEMIST_FOLLOWUP_SYNC_KIND, DCR_SUBMIT_SYNC_KIND].every((k) => (SYNC_RECORD_KINDS as readonly string[]).includes(k))).toBe(true);
    const server = new Set<string>([...Object.values(GATE_CODES), ...Object.values(LOG_CODES)]);
    expect(new Set<string>(DCR_REFUSAL_CODES)).toEqual(server);
  });

  it('the server accepts every payload exactly as the contract types it', () => {
    const doctorCall: DoctorCallPayload = { reportDate: DAY, doctorId: oid('a'), workingType: 'FIELD_WORK', workWith: [oid('b')], capturedLocation: gps, accuracyMeters: 12, samples: [{ productId: oid('c'), quantity: 2 }] };
    expect(doctorCallPayloadSchema.parse(doctorCall)).toMatchObject({ doctorId: oid('a'), samples: [{ quantity: 2 }], remarks: null });
    const minimal: DoctorCallPayload = { reportDate: DAY, doctorId: oid('a'), workingType: 'MEETING', workWith: [], capturedLocation: null };
    expect(doctorCallPayloadSchema.parse(minimal)).toMatchObject({ capturedLocation: null, accuracyMeters: null, samples: [] });
    const chemistCall: ChemistCallPayload = { reportDate: DAY, chemistId: oid('d'), workingType: 'FIELD_WORK', workWith: [], capturedLocation: gps };
    expect(chemistCallPayloadSchema.parse(chemistCall).chemistId).toBe(oid('d'));
    const df: DoctorFollowupPayload = { reportDate: DAY, doctorId: oid('a'), remarks: 'call again' };
    const cf: ChemistFollowupPayload = { reportDate: DAY, chemistId: oid('d'), remarks: 'restock' };
    expect(doctorFollowupPayloadSchema.parse(df).remarks).toBe('call again');
    expect(chemistFollowupPayloadSchema.parse(cf).remarks).toBe('restock');
  });

  it('and refuses a malformed one: bad ids, out-of-range GPS, a repeated sample product, empty follow-up remarks', () => {
    const ok = { reportDate: DAY, doctorId: oid('a'), workingType: 'FIELD_WORK', workWith: [], capturedLocation: gps };
    for (const bad of [
      { ...ok, doctorId: 'x' },
      { ...ok, workingType: 'PICNIC' },
      { ...ok, capturedLocation: { latitude: 91, longitude: 0 } },
      { ...ok, samples: [{ productId: oid('c'), quantity: 0 }] },
      { ...ok, samples: [{ productId: oid('c'), quantity: 1.5 }] },
      { ...ok, samples: [{ productId: oid('c'), quantity: 1 }, { productId: oid('c'), quantity: 2 }] },
      { ...ok, reportDate: '2026-13-01' },
      { ...ok, accuracyMeters: -1 },
    ]) expect(doctorCallPayloadSchema.safeParse(bad).success).toBe(false);
    expect(doctorFollowupPayloadSchema.safeParse({ reportDate: DAY, doctorId: oid('a'), remarks: '  ' }).success).toBe(false);
  });
});

describe('the call handlers', () => {
  let kit: ReturnType<typeof faKit>;
  let handlers: ReturnType<typeof makeCallSyncHandlers>;
  const by = (kind: string) => handlers.find((h) => h.kind === kind)!;
  const run = (kind: string, payload: unknown, at = new Date('2026-10-05T04:00:00Z')) => by(kind).apply({ userId: 'mr1', clientId: 'c-1', clientCreatedAt: at, payload }, new Tx());
  const refusal = async (kind: string, payload: unknown) => {
    const err = await run(kind, payload).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SyncRejection);
    return err as SyncRejection;
  };

  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    handlers = makeCallSyncHandlers({
      doctorCall: kit.logDoctorCall,
      chemistCall: kit.logChemistCall,
      followup: kit.logFollowup,
      parse: {
        doctorCall: (p) => doctorCallPayloadSchema.parse(p),
        chemistCall: (p) => chemistCallPayloadSchema.parse(p),
        doctorFollowup: (p) => doctorFollowupPayloadSchema.parse(p),
        chemistFollowup: (p) => chemistFollowupPayloadSchema.parse(p),
      },
    });
  });

  const doctorPayload = { reportDate: DAY, doctorId: 'd1', workingType: 'FIELD_WORK', workWith: [] as string[], capturedLocation: gps };

  it('registers the four kinds', () => {
    expect(handlers.map((h) => h.kind).sort()).toEqual(['CHEMIST_CALL', 'CHEMIST_FOLLOWUP', 'DOCTOR_CALL', 'DOCTOR_FOLLOWUP']);
  });

  it('a call returns the server’s id and its own geofence result for the phone to take (G10)', async () => {
    // ids in the fake master data are short strings; the payload schema wants ObjectIds, so build the handler with a lenient parse
    const lenient = makeCallSyncHandlers({ doctorCall: kit.logDoctorCall, chemistCall: kit.logChemistCall, followup: kit.logFollowup, parse: { doctorCall: (p) => p as never, chemistCall: (p) => p as never, doctorFollowup: (p) => p as never, chemistFollowup: (p) => p as never } });
    const out = await lenient.find((h) => h.kind === 'DOCTOR_CALL')!.apply({ userId: 'mr1', clientId: 'c-1', clientCreatedAt: new Date('2026-10-05T04:00:00Z'), payload: { ...doctorPayload, workWith: [], samples: [] } }, new Tx());
    expect(out).toMatchObject({ serverId: expect.any(String), data: { geofence: { status: 'PASS', distanceMeters: 0, reason: null } } });
  });

  it('a payload that isn’t a call → INVALID_PAYLOAD naming the first problem, with no parser internals', async () => {
    for (const kind of [DOCTOR_CALL_SYNC_KIND, CHEMIST_CALL_SYNC_KIND, DOCTOR_FOLLOWUP_SYNC_KIND, CHEMIST_FOLLOWUP_SYNC_KIND]) {
      const r = await refusal(kind, { nonsense: true });
      expect(r.code).toBe('INVALID_PAYLOAD');
      expect(r.message).not.toMatch(/ZodError|invalid_type|at path/i);
    }
    expect((await refusal(DOCTOR_CALL_SYNC_KIND, { ...doctorPayload, doctorId: 'x' })).message).toMatch(/^doctorId:/);
  });

  it('a gate refusal and a lookup refusal each reach the phone as that record’s reason, with their own code', async () => {
    const lenient = makeCallSyncHandlers({ doctorCall: kit.logDoctorCall, chemistCall: kit.logChemistCall, followup: kit.logFollowup, parse: { doctorCall: (p) => p as never, chemistCall: (p) => p as never, doctorFollowup: (p) => p as never, chemistFollowup: (p) => p as never } });
    const apply = (payload: unknown) => lenient.find((h) => h.kind === 'DOCTOR_CALL')!.apply({ userId: 'mr1', clientId: 'c-1', clientCreatedAt: new Date('2026-10-05T04:00:00Z'), payload }, new Tx());
    const code = async (payload: unknown) => ((await apply(payload).then(() => null, (e: unknown) => e)) as SyncRejection).code;
    kit.fmd.assigned.delete('mr1:d1');
    expect(await code({ ...doctorPayload, workWith: [], samples: [] })).toBe('DOCTOR_NOT_ASSIGNED');
    kit.planning.approved.clear();
    expect(await code({ ...doctorPayload, workWith: [], samples: [] })).toBe('DAILY_PLAN_NOT_APPROVED');
  });
});
