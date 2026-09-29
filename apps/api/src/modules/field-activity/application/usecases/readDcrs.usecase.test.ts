import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { faKit } from './faTestKit.js';
import { GetDcrUseCase, ListAllDcrsUseCase, ListMyDcrsUseCase, ListTeamDcrsUseCase } from './readDcrs.usecase.js';

async function expectStatus(p: Promise<unknown>, statusCode: number) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('reading DCRs', () => {
  let kit: ReturnType<typeof faKit>;
  let mine: string;
  beforeEach(async () => {
    kit = faKit();
    mine = (await kit.dcrs.getOrCreate('mr1', '2026-10-05')).id;
    await kit.dcrs.getOrCreate('mr1', '2026-10-03');
    await kit.dcrs.getOrCreate('mr2', '2026-10-05');
    await kit.dcrs.getOrCreate('stranger', '2026-10-05');
    await kit.approvals.submit({ kind: 'DCR', recordId: mine, submitterId: 'mr1' });
  });

  it('my list is mine only, newest first, with each one’s status (DRAFT until submitted)', async () => {
    const list = await new ListMyDcrsUseCase(kit.dcrs, kit.views).execute('mr1', '2026-10-01', '2026-10-31');
    expect(list.map((d) => [d.reportDate, d.status])).toEqual([['2026-10-05', 'SUBMITTED'], ['2026-10-03', 'DRAFT']]);
    expect(list[0]!.approval).toMatchObject({ cycle: 1 });
    expect(list[1]!.approval).toBeNull();
    expect((await new ListMyDcrsUseCase(kit.dcrs, kit.views).execute('mr1', '2026-10-04', '2026-10-04'))).toEqual([]);
  });

  it('a manager sees their downline’s, read-only, and can narrow to one report — never someone outside their team', async () => {
    const team = new ListTeamDcrsUseCase(kit.dcrs, kit.users, kit.views);
    const asm = { id: 'asm', role: 'FIELD' as const };
    expect((await team.execute(asm, '2026-10-01', '2026-10-31', null)).map((d) => d.userId).sort()).toEqual(['mr1', 'mr1', 'mr2']);
    expect((await team.execute(asm, '2026-10-01', '2026-10-31', 'mr2')).map((d) => d.userId)).toEqual(['mr2']);
    await expectStatus(team.execute(asm, '2026-10-01', '2026-10-31', 'stranger'), 403);
    expect(await team.execute({ id: 'stranger', role: 'FIELD' }, '2026-10-01', '2026-10-31', null)).toEqual([]);
  });

  it('Admin reads anyone’s by naming them', async () => {
    const all = new ListAllDcrsUseCase(kit.dcrs, kit.users, kit.views);
    expect((await all.execute('2026-10-01', '2026-10-31', 'mr2')).map((d) => d.userId)).toEqual(['mr2']);
    await expectStatus(all.execute('2026-10-01', '2026-10-31', 'nobody'), 404);
  });

  it('one DCR: the owner, their manager, Admin — nobody else', async () => {
    const get = new GetDcrUseCase(kit.dcrs, kit.users, kit.views);
    for (const actor of [{ id: 'mr1', role: 'FIELD' as const }, { id: 'asm', role: 'FIELD' as const }, { id: 'admin', role: 'ADMIN' as const }]) {
      expect((await get.execute(actor, mine)).status).toBe('SUBMITTED');
    }
    await expectStatus(get.execute({ id: 'mr2', role: 'FIELD' }, mine), 403);
    await expectStatus(get.execute({ id: 'stranger', role: 'FIELD' }, mine), 403);
    await expectStatus(get.execute({ id: 'mr1', role: 'FIELD' }, 'nope'), 404);
  });
});
