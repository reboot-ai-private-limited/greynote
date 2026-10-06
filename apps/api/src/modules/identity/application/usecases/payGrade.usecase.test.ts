import { describe, expect, it } from 'vitest';
import { payBandNameKey, type PayBand } from '../../domain/payBand.entity.js';
import { DESIGNATION_LEVEL } from '../../domain/designation.entity.js';
import { CreateDesignationUseCase } from './createDesignation.usecase.js';
import { CreatePayBandUseCase } from './createPayBand.usecase.js';
import { UpdatePayBandUseCase } from './updatePayBand.usecase.js';

const rates = { taPerKmRatePaise: 750, hqDaPaise: 0, exStationDaPaise: 20_000, outStationDaPaise: 50_000 };
const grade = (name: string): Omit<PayBand, 'id'> => ({ name, ...rates });

function repo() {
  const rows: PayBand[] = [];
  return {
    rows,
    findById: async (id: string) => rows.find((r) => r.id === id) ?? null,
    findByName: async (name: string) => rows.find((r) => payBandNameKey(r.name) === payBandNameKey(name)) ?? null,
    list: async () => rows,
    create: async (i: Omit<PayBand, 'id'>) => {
      const row = { ...i, id: `b${rows.length + 1}` };
      rows.push(row);
      return row;
    },
    update: async (id: string, i: Partial<PayBand>) => Object.assign(rows.find((r) => r.id === id)!, i),
  };
}

describe('pay grades', () => {
  it('are not limited to three or to G-names', async () => {
    const r = repo();
    const create = new CreatePayBandUseCase(r as never);
    for (const name of ['G1', 'G2', 'G3', 'G4', 'Trainee', 'Senior Executive', 'G10', 'G11', 'G12']) await create.execute(grade(name));
    expect(r.rows).toHaveLength(9);
  });

  it('are unique ignoring case and extra spaces', async () => {
    const r = repo();
    const create = new CreatePayBandUseCase(r as never);
    await create.execute(grade('Senior Executive'));
    await expect(create.execute(grade('  senior   EXECUTIVE '))).rejects.toMatchObject({ statusCode: 409 });
  });

  it('hold no CTC: a grade is its name and its rates', async () => {
    const create = new CreatePayBandUseCase(repo() as never);
    await expect(create.execute({ ...grade('A'), ctcMinAnnualPaise: 5 } as never)).resolves.toMatchObject({ name: 'A' });
  });

  it('refuse a rate that is not whole paise', async () => {
    const create = new CreatePayBandUseCase(repo() as never);
    await expect(create.execute({ ...grade('B'), hqDaPaise: 1.5 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('can be renamed, but not to another grade’s name', async () => {
    const r = repo();
    const a = await r.create(grade('G1'));
    await r.create(grade('G2'));
    const update = new UpdatePayBandUseCase(r as never);
    await expect(update.execute(a.id, { name: 'g2' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(update.execute(a.id, { name: 'G1' })).resolves.toMatchObject({ name: 'G1' }); // itself
    await expect(update.execute(a.id, { name: 'Associate' })).resolves.toMatchObject({ name: 'Associate' });
    await expect(update.execute('nope', { name: 'X' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('designation levels', () => {
  it('are fixed by the name and never taken from the request', async () => {
    const created: unknown[] = [];
    const repository = { findByName: async () => null, create: async (i: object) => (created.push(i), { id: 'd', ...i }) };
    const out = await new CreateDesignationUseCase(repository as never).execute({ name: 'RSM', level: 99 } as never);
    expect(out).toMatchObject({ name: 'RSM', level: 3 });
    expect(DESIGNATION_LEVEL).toEqual({ MR: 1, ASM: 2, RSM: 3, ZSM: 4, NSM: 5 });
  });
});
