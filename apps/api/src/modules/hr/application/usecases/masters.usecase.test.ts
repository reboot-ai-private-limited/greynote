import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DEFAULT_LEAVE_TYPES } from '../../domain/leaveType.entity.js';
import { HolidayCalendar } from '../holidayCalendar.js';
import { CreateHolidayUseCase } from './createHoliday.usecase.js';
import { CreateLeaveTypeUseCase } from './createLeaveType.usecase.js';
import { FakeHolidays, FakeLeaveTypes, FakePolicies, FakeTerritory, FakeUsers } from './hrTestKit.js';
import { ListHolidaysUseCase } from './listHolidays.usecase.js';
import { ListLeavePoliciesUseCase } from './listLeavePolicies.usecase.js';
import { SetLeavePolicyUseCase } from './setLeavePolicy.usecase.js';
import { UpdateLeaveTypeUseCase } from './updateLeaveType.usecase.js';

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('Leave types and the Leave Master', () => {
  let types: FakeLeaveTypes;
  let policies: FakePolicies;
  let users: FakeUsers;

  beforeEach(async () => {
    types = new FakeLeaveTypes();
    policies = new FakePolicies();
    users = new FakeUsers();
    await types.seed(DEFAULT_LEAVE_TYPES);
  });

  const typeId = (name: string) => types.rows.find((t) => t.name === name)!.id;

  it('seeds the starting list once, and refuses a duplicate name ignoring case', async () => {
    await types.seed(DEFAULT_LEAVE_TYPES);
    expect(types.rows.map((t) => [t.name, t.isPaid])).toEqual([
      ['Casual', true],
      ['Sick', true],
      ['Earned', true],
      ['Loss of Pay', false],
    ]);
    await expectStatus(new CreateLeaveTypeUseCase(types).execute({ name: ' casual ', isPaid: true }), 409);
  });

  it('locks isPaid once a type is in use, but still allows a rename', async () => {
    const update = new UpdateLeaveTypeUseCase(types, (id) => policies.existsForLeaveType(id));
    expect((await update.execute(typeId('Earned'), { isPaid: false })).isPaid).toBe(false);
    await update.execute(typeId('Earned'), { isPaid: true });
    await new SetLeavePolicyUseCase(policies, types, users).execute({ payBandId: 'band-g1', leaveTypeId: typeId('Earned'), defaultDays: 15, actorId: 'hr' });
    await expectStatus(update.execute(typeId('Earned'), { isPaid: false }), 409);
    expect((await update.execute(typeId('Earned'), { name: 'Privilege' })).name).toBe('Privilege');
  });

  it('sets default days for paid types only, and lists every grade × paid type', async () => {
    const set = new SetLeavePolicyUseCase(policies, types, users);
    await set.execute({ payBandId: 'band-g1', leaveTypeId: typeId('Casual'), defaultDays: 12, actorId: 'hr' });
    await set.execute({ payBandId: 'band-g1', leaveTypeId: typeId('Casual'), defaultDays: 12.5, actorId: 'hr' });
    await expectStatus(set.execute({ payBandId: 'band-g1', leaveTypeId: typeId('Loss of Pay'), defaultDays: 5, actorId: 'hr' }), 400);
    await expectStatus(set.execute({ payBandId: 'band-x', leaveTypeId: typeId('Casual'), defaultDays: 5, actorId: 'hr' }), 404);

    const grid = await new ListLeavePoliciesUseCase(policies, types, users).execute();
    expect(grid).toHaveLength(6); // 2 grades × 3 paid types
    expect(grid.find((r) => r.payBandName === 'G1' && r.leaveTypeName === 'Casual')?.defaultDays).toBe(12.5);
    expect(grid.find((r) => r.payBandName === 'G2' && r.leaveTypeName === 'Casual')?.defaultDays).toBeNull();
  });
});

describe('Holidays', () => {
  let holidays: FakeHolidays;
  let territory: FakeTerritory;
  let create: CreateHolidayUseCase;
  let list: ListHolidaysUseCase;

  beforeEach(async () => {
    holidays = new FakeHolidays();
    territory = new FakeTerritory();
    territory.userHq.set('mr-slg', { hqId: 'hq-slg', zoneId: 'zone-wb' });
    territory.userHq.set('mr-jpg', { hqId: 'hq-jpg', zoneId: 'zone-wb' });
    create = new CreateHolidayUseCase(holidays, territory);
    list = new ListHolidaysUseCase(holidays, territory);
    const base = { zoneIds: [] as string[], hqIds: [] as string[] };
    await create.execute({ ...base, name: 'Gandhi Jayanti', date: '2026-10-02', scope: 'NATIONAL' }, 'hr');
    await create.execute({ ...base, name: 'Durga Puja', date: '2026-10-20', scope: 'ZONE', zoneIds: ['zone-wb'] }, 'hr');
    await create.execute({ ...base, name: 'Siliguri Day', date: '2026-10-25', scope: 'HQ', hqIds: ['hq-slg'] }, 'hr');
    await create.execute({ ...base, name: 'Bihu', date: '2026-10-15', scope: 'ZONE', zoneIds: ['zone-as'] }, 'hr');
  });

  const range = { from: '2026-10-01', to: '2026-10-31' };

  it('checks scope against the ids given, and that they’re active', async () => {
    const base = { name: 'X', date: '2026-11-01', zoneIds: [] as string[], hqIds: [] as string[] };
    await expectStatus(create.execute({ ...base, scope: 'NATIONAL', zoneIds: ['zone-wb'] }, 'hr'), 400);
    await expectStatus(create.execute({ ...base, scope: 'ZONE' }, 'hr'), 400);
    await expectStatus(create.execute({ ...base, scope: 'HQ', hqIds: ['hq-slg'], zoneIds: ['zone-wb'] }, 'hr'), 400);
    await expectStatus(create.execute({ ...base, scope: 'HQ', hqIds: ['hq-old'] }, 'hr'), 400);
    await expectStatus(create.execute({ ...base, scope: 'ZONE', zoneIds: ['zone-nope'] }, 'hr'), 400);
  });

  it('shows field staff only the holidays that apply to them', async () => {
    const names = async (id: string) => (await list.execute({ id, role: 'FIELD' }, range)).map((h) => h.name);
    expect(await names('mr-slg')).toEqual(['Gandhi Jayanti', 'Durga Puja', 'Siliguri Day']);
    expect(await names('mr-jpg')).toEqual(['Gandhi Jayanti', 'Durga Puja']);
    expect(await names('mr-no-hq')).toEqual(['Gandhi Jayanti']);
  });

  it('shows HR every holiday, filterable', async () => {
    expect(await list.execute({ id: 'hr', role: 'HR' }, range)).toHaveLength(4);
    expect((await list.execute({ id: 'hr', role: 'HR' }, { ...range, zoneId: 'zone-wb' })).map((h) => h.name)).toEqual(['Durga Puja']);
  });

  it('gives other modules an employee’s holiday dates', async () => {
    const calendar = new HolidayCalendar(holidays, territory);
    expect([...(await calendar.datesFor('mr-slg', range.from, range.to))].sort()).toEqual(['2026-10-02', '2026-10-20', '2026-10-25']);
  });
});
