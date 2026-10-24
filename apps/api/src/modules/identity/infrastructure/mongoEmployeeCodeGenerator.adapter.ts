import { Schema, model } from 'mongoose';
import type { RoleName } from '@greynote/contracts';
import { EMPLOYEE_CODE_FIRST, formatAdminCode, formatEmployeeCode } from '../domain/employeeCode.js';
import type { EmployeeCodeGeneratorPort } from '../domain/employeeCode.generator.port.js';
import type { UserRepositoryPort } from '../domain/user.repository.port.js';
import { UserModel } from './user.schema.js';

interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>({ _id: { type: String }, seq: { type: Number, required: true } });
const CounterModel = model<CounterDoc>('Counter', counterSchema);

/** One counter per series: `employeeCode` for GHC001…, `adminCode` for ADMIN01… */
const SERIES = {
  GHC: { key: 'employeeCode', pattern: /^GHC\d+$/, skip: 3, first: EMPLOYEE_CODE_FIRST, format: formatEmployeeCode },
  ADMIN: { key: 'adminCode', pattern: /^ADMIN\d+$/, skip: 5, first: 1, format: formatAdminCode },
} as const;
const MAX_ATTEMPTS = 20;
const DUPLICATE_KEY = 11000;

/**
 * A counter document, bumped with one atomic `$inc`, so two people creating employees at once never
 * get the same number. The first time, the counter starts at the highest GHC code already in use (or just below GHC001),
 * so it never collides with codes typed by hand before.
 */
export class MongoEmployeeCodeGenerator implements EmployeeCodeGeneratorPort {
  constructor(private readonly users: UserRepositoryPort) {}

  async next(role?: RoleName): Promise<string> {
    const series = role === 'ADMIN' ? SERIES.ADMIN : SERIES.GHC;
    await this.ensureSeeded(series);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const counter = await CounterModel.findOneAndUpdate({ _id: series.key }, { $inc: { seq: 1 } }, { new: true }).lean();
      if (!counter) throw new Error('Employee code counter is missing.');
      const code = series.format(counter.seq);
      // A code made by hand after the seed could still equal this one: skip it.
      if (!(await this.users.existsByEmployeeCode(code))) return code;
    }
    throw new Error('Could not find a free employee code.');
  }

  private async ensureSeeded(series: (typeof SERIES)[keyof typeof SERIES]): Promise<void> {
    if (await CounterModel.exists({ _id: series.key })) return;
    const rows = await UserModel.aggregate<{ max: number | null }>([
      { $match: { employeeCode: series.pattern } },
      { $group: { _id: null, max: { $max: { $toInt: { $substrBytes: ['$employeeCode', series.skip, 20] } } } } },
    ]);
    const start = Math.max(rows[0]?.max ?? 0, series.first - 1);
    try {
      await CounterModel.create({ _id: series.key, seq: start });
    } catch (error) {
      // Another request seeded it first: fine.
      if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
    }
  }
}
