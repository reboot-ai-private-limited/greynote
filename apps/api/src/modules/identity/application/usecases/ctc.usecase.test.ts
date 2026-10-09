import { describe, expect, it } from 'vitest';
import type { AppError } from '@/shared/errors/AppError.js';
import type { CtcAssignment } from '../../domain/ctcAssignment.entity.js';
import { DEFAULT_PAY_COMPONENTS } from '../../domain/defaultPayComponents.js';
import type { PayComponent } from '../../domain/payComponent.entity.js';
import { AssignCtcUseCase } from './assignCtc.usecase.js';
import { CreatePayComponentUseCase } from './createPayComponent.usecase.js';
import { GetCtcForMonthUseCase } from './getCtcForMonth.usecase.js';
import { PreviewCtcUseCase } from './previewCtc.usecase.js';
import { ReapplyCtcUseCase } from './reapplyCtc.usecase.js';
import { SeedDefaultPayComponentsUseCase } from './seedDefaultPayComponents.usecase.js';
import { UpdatePayComponentUseCase } from './updatePayComponent.usecase.js';

const RUPEE = 100;
const CTC = 144_000 * RUPEE;

function kit() {
  const components: PayComponent[] = [];
  let n = 0;
  const componentRepo = {
    list: async () => [...components].sort((a, b) => a.order - b.order),
    findById: async (id: string) => components.find((c) => c.id === id) ?? null,
    create: async (input: Omit<PayComponent, 'id'>) => {
      const c = { ...input, id: `c${++n}` };
      components.push(c);
      return c;
    },
    update: async (id: string, patch: Partial<PayComponent>) => {
      const i = components.findIndex((c) => c.id === id);
      components[i] = { ...components[i]!, ...patch };
      return components[i]!;
    },
  };
  const saved: CtcAssignment[] = [];
  const assignmentRepo = {
    create: async (input: Omit<CtcAssignment, 'id' | 'createdAt'>) => {
      const a = { ...input, id: `a${saved.length + 1}`, createdAt: new Date(2026, 0, saved.length + 1) };
      saved.push(a);
      return a;
    },
    listByUser: async (userId: string) => saved.filter((a) => a.userId === userId),
    findEffective: async (userId: string, month: string) =>
      saved
        .filter((a) => a.userId === userId && a.effectiveFrom <= month)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    listUserIds: async () => [...new Set(saved.map((a) => a.userId))],
  };
  const users = {
    findById: async (id: string) => (id === 'field1' || id === 'field2' ? { id, roleId: 'r-field' } : id === 'admin1' ? { id, roleId: 'r-admin' } : null),
  };
  const roles = { findById: async (id: string) => ({ id, name: id === 'r-field' ? 'FIELD' : 'ADMIN' }) };
  // The CTC is the employee's own: no grade, no range. The jump warning reads CTC_JUMP_WARN_PERCENT (50).
  const config = { get: async () => '50' };
  return { components, saved, componentRepo, assignmentRepo, users, roles, config };
}

async function seeded() {
  const k = kit();
  await new SeedDefaultPayComponentsUseCase(k.componentRepo as never).execute();
  const useCase = new AssignCtcUseCase(k.users as never, k.roles as never, k.componentRepo as never, k.assignmentRepo as never, k.config as never);
  const assign = { execute: async (...args: Parameters<typeof useCase.execute>) => (await useCase.execute(...args)).assignment };
  return { ...k, assign, useCase };
}

describe('pay component formula', () => {
  it('seeds the starting formula once and never overwrites an edited one', async () => {
    const { components, componentRepo } = await seeded();
    expect(components.map((c) => c.code)).toEqual(DEFAULT_PAY_COMPONENTS.map((c) => c.code));
    const medical = components.find((c) => c.code === 'MEDICAL')!;
    await componentRepo.update(medical.id, { rule: { type: 'FIXED', amountPaise: 6_000_00 } });
    await new SeedDefaultPayComponentsUseCase(componentRepo as never).execute();
    expect(components).toHaveLength(DEFAULT_PAY_COMPONENTS.length);
    expect(components.find((c) => c.code === 'MEDICAL')!.rule).toEqual({ type: 'FIXED', amountPaise: 6_000_00 });
  });

  it('refuses a change that breaks the formula (Basic 20%, a second balancer, a duplicate code)', async () => {
    const { components, componentRepo } = await seeded();
    const update = new UpdatePayComponentUseCase(componentRepo as never);
    const create = new CreatePayComponentUseCase(componentRepo as never);
    const basic = components.find((c) => c.code === 'BASIC')!;
    await expect(update.execute(basic.id, { rule: { type: 'PERCENT_OF_CTC', basisPoints: 2000 } })).rejects.toMatchObject({ statusCode: 400 } satisfies Partial<AppError>);
    await expect(create.execute({ code: 'EXTRA', name: 'Extra', kind: 'EARNING', order: 9, isActive: true, rule: { type: 'BALANCER' } })).rejects.toMatchObject({ statusCode: 400 });
    await expect(create.execute({ code: 'BASIC', name: 'Dup', kind: 'EARNING', order: 9, isActive: true, rule: { type: 'FIXED', amountPaise: 0 } })).rejects.toMatchObject({ statusCode: 409 });
    expect(basic.rule).toEqual({ type: 'PERCENT_OF_CTC', basisPoints: 3000 });
  });

  it('lets Admin add an allowance as data', async () => {
    const { componentRepo, components } = await seeded();
    await new CreatePayComponentUseCase(componentRepo as never).execute({ code: 'HRA', name: 'HRA', kind: 'EARNING', order: 3, isActive: true, rule: { type: 'PERCENT_OF_CTC', basisPoints: 1000 } });
    const preview = await new PreviewCtcUseCase(componentRepo as never).execute(CTC);
    expect(preview.lines.find((l) => l.code === 'HRA')!.amountPaise).toBe(14_400 * RUPEE);
    expect(preview.lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(CTC);
    expect(components.some((c) => c.code === 'HRA')).toBe(true);
  });
});

describe('CTC preview', () => {
  it('returns lines plus gross, without saving', async () => {
    const { componentRepo, saved } = await seeded();
    const p = await new PreviewCtcUseCase(componentRepo as never).execute(CTC);
    expect(p.grossAnnualPaise).toBe(CTC - 570_240 - 1_080 * RUPEE);
    expect(p.grossMonthlyPaise).toBe(Math.round(p.grossAnnualPaise / 12));
    expect(saved).toHaveLength(0);
  });

  it('a bad override is a 400', async () => {
    const { componentRepo } = await seeded();
    await expect(new PreviewCtcUseCase(componentRepo as never).execute(CTC, { OTHER: 5 })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('assigning a CTC', () => {
  it('saves a frozen breakdown for a field employee', async () => {
    const { assign, saved } = await seeded();
    const a = await assign.execute('field1', { ctcAnnualPaise: CTC, effectiveFrom: '2026-10' }, 'hr1');
    expect(a.lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(CTC);
    expect(saved).toHaveLength(1);
  });

  it('is only for field employees and known users', async () => {
    const { assign } = await seeded();
    await expect(assign.execute('admin1', { ctcAnnualPaise: CTC, effectiveFrom: '2026-10' }, 'hr1')).rejects.toMatchObject({ statusCode: 400 });
    await expect(assign.execute('ghost', { ctcAnnualPaise: CTC, effectiveFrom: '2026-10' }, 'hr1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('does not tie the CTC to a grade: any positive amount is saved, whatever the grade', async () => {
    const { assign, saved } = await seeded();
    for (const [i, ctc] of [1, 14_400 * RUPEE, 900_000 * RUPEE].entries()) await assign.execute('field2', { ctcAnnualPaise: ctc, effectiveFrom: `2026-0${i + 1}` }, 'hr1');
    expect(saved).toHaveLength(3);
  });

  it('warns, never refuses, when the CTC is more than the set percent above the previous one', async () => {
    const { useCase, saved } = await seeded();
    const first = await useCase.execute('field1', { ctcAnnualPaise: 100_000 * RUPEE, effectiveFrom: '2026-04' }, 'hr1');
    expect(first.warning).toBeNull();
    expect((await useCase.execute('field1', { ctcAnnualPaise: 150_000 * RUPEE, effectiveFrom: '2026-07' }, 'hr1')).warning).toBeNull();
    const jump = await useCase.execute('field1', { ctcAnnualPaise: 1_500_000 * RUPEE, effectiveFrom: '2026-10' }, 'hr1');
    expect(jump.warning).toMatch(/more than 50%/);
    expect(saved).toHaveLength(3);
  });

  it('appends revisions; a month resolves to the latest one in force, and a later formula edit does not touch saved ones', async () => {
    const { assign, saved, components, componentRepo } = await seeded();
    await assign.execute('field1', { ctcAnnualPaise: CTC, effectiveFrom: '2026-04' }, 'hr1');
    await assign.execute('field1', { ctcAnnualPaise: 180_000 * RUPEE, effectiveFrom: '2026-10' }, 'hr1');
    await assign.execute('field1', { ctcAnnualPaise: 200_000 * RUPEE, effectiveFrom: '2026-10', reason: 'correction' }, 'hr1');
    const get = new GetCtcForMonthUseCase(componentRepoAssignments(saved));
    expect(await get.execute('field1', '2026-03')).toBeNull();
    expect((await get.execute('field1', '2026-09'))!.ctcAnnualPaise).toBe(CTC);
    expect((await get.execute('field1', '2026-12'))!.ctcAnnualPaise).toBe(200_000 * RUPEE);
    const before = JSON.stringify(saved[0]!.lines);
    await new UpdatePayComponentUseCase(componentRepo as never).execute(components.find((c) => c.code === 'MEDICAL')!.id, { rule: { type: 'FIXED', amountPaise: 12_000 * RUPEE } });
    expect(JSON.stringify(saved[0]!.lines)).toBe(before);
    expect(saved).toHaveLength(3);
  });
});

function componentRepoAssignments(saved: CtcAssignment[]) {
  return {
    findEffective: async (userId: string, month: string) =>
      saved
        .filter((a) => a.userId === userId && a.effectiveFrom <= month)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
  } as never;
}

describe('re-applying the formula', () => {
  it('creates new revisions on the current formula, keeping each employee\'s overrides', async () => {
    const { assign, saved, components, componentRepo, assignmentRepo } = await seeded();
    await assign.execute('field1', { ctcAnnualPaise: CTC, effectiveFrom: '2026-04', overrides: { MEDICAL: 6_000 * RUPEE } }, 'hr1');
    await new UpdatePayComponentUseCase(componentRepo as never).execute(components.find((c) => c.code === 'BASIC')!.id, { rule: { type: 'PERCENT_OF_CTC', basisPoints: 4000 } });
    const out = await new ReapplyCtcUseCase(componentRepo as never, assignmentRepo as never).execute({ effectiveFrom: '2026-11' }, 'hr1');
    expect(out).toEqual([expect.objectContaining({ userId: 'field1', outcome: 'revised' })]);
    const revised = saved[1]!;
    expect(revised.lines.find((l) => l.code === 'BASIC')!.amountPaise).toBe(57_600 * RUPEE);
    expect(revised.lines.find((l) => l.code === 'MEDICAL')!.amountPaise).toBe(6_000 * RUPEE);
    expect(saved[0]!.lines.find((l) => l.code === 'BASIC')!.amountPaise).toBe(43_200 * RUPEE);
  });

  it('skips one employee without failing the rest', async () => {
    const { assign, saved, componentRepo, assignmentRepo } = await seeded();
    await assign.execute('field1', { ctcAnnualPaise: CTC, effectiveFrom: '2026-04' }, 'hr1');
    saved.push({ ...saved[0]!, id: 'x', userId: 'field2', overrides: { GONE: 1 } });
    const out = await new ReapplyCtcUseCase(componentRepo as never, assignmentRepo as never).execute({ effectiveFrom: '2026-11' }, 'hr1');
    expect(out.map((o) => o.outcome).sort()).toEqual(['revised', 'skipped']);
  });
});

describe("an employee's own structure", () => {
  const own = {
    basicBasisPoints: 4000,
    ruleOverrides: {
      FDA: { type: 'PERCENT_OF_COMPONENTS' as const, basisPoints: 1400, of: ['BASIC'] },
    },
    removed: ['MEDICAL'],
    extras: [
      {
        code: 'CONVEYANCE',
        name: 'Conveyance',
        kind: 'EARNING' as const,
        rule: { type: 'FIXED' as const, amountPaise: 9_600 * RUPEE },
      },
    ],
  };

  it('previews the shaped breakdown, which still adds up to the CTC', async () => {
    const { componentRepo } = await seeded();
    const p = await new PreviewCtcUseCase(componentRepo as never).execute(CTC, {}, own);
    expect(p.lines.find((l) => l.code === 'BASIC')!.amountPaise).toBe(57_600 * RUPEE);
    expect(p.lines.find((l) => l.code === 'FDA')!.amountPaise).toBe(8_064 * RUPEE);
    expect(p.lines.find((l) => l.code === 'MEDICAL')).toBeUndefined();
    expect(p.lines.reduce((s, l) => s + l.amountPaise, 0)).toBe(CTC);
  });

  it('refuses removing Basic as a 400', async () => {
    const { componentRepo } = await seeded();
    await expect(
      new PreviewCtcUseCase(componentRepo as never).execute(
        CTC,
        {},
        { ...own, removed: ['BASIC'] },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('saves the structure with the revision, and re-apply keeps it while the org formula moves on', async () => {
    const { assign, saved, components, componentRepo, assignmentRepo } = await seeded();
    await assign.execute(
      'field1',
      { ctcAnnualPaise: CTC, effectiveFrom: '2026-04', structure: own },
      'hr1',
    );
    expect(saved[0]!.structure).toEqual(own);

    // Admin raises the org's FDA to 12% of Basic: this employee's own 14% and 40% Basic stay.
    await new UpdatePayComponentUseCase(componentRepo as never).execute(
      components.find((c) => c.code === 'FDA')!.id,
      { rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC'] } },
    );
    await new ReapplyCtcUseCase(componentRepo as never, assignmentRepo as never).execute(
      { effectiveFrom: '2026-11' },
      'hr1',
    );
    const revised = saved[1]!;
    expect(revised.structure).toEqual(own);
    expect(revised.lines.find((l) => l.code === 'FDA')!.amountPaise).toBe(8_064 * RUPEE);
    expect(revised.lines.find((l) => l.code === 'CONVEYANCE')!.amountPaise).toBe(9_600 * RUPEE);
  });

  it('a revision with no structure reads as the org formula', async () => {
    const { assign } = await seeded();
    const a = await assign.execute(
      'field1',
      { ctcAnnualPaise: CTC, effectiveFrom: '2026-10' },
      'hr1',
    );
    expect(a.structure).toEqual({ ruleOverrides: {}, removed: [], extras: [] });
  });
});
