import { Schema, model } from 'mongoose';
import { EMPLOYEE_CODE_FIRST, formatEmployeeCode } from '../domain/employeeCode.js';
import type { EmployeeCodeGeneratorPort } from '../domain/employeeCode.generator.port.js';
import type { UserRepositoryPort } from '../domain/user.repository.port.js';
import { UserModel } from './user.schema.js';

interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>({ _id: { type: String }, seq: { type: Number, required: true } });
const CounterModel = model<CounterDoc>('Counter', counterSchema);

const KEY = 'employeeCode';
const MAX_ATTEMPTS = 20;
const DUPLICATE_KEY = 11000;

/**
 * A counter document, bumped with one atomic `$inc`, so two people creating employees at once never
 * get the same number. The first time, the counter starts at the highest GHC code already in use (or just below GHC001),
 * so it never collides with codes typed by hand before.
 */
export class MongoEmployeeCodeGenerator implements EmployeeCodeGeneratorPort {
  constructor(private readonly users: UserRepositoryPort) {}

  async next(): Promise<string> {
    await this.ensureSeeded();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const counter = await CounterModel.findOneAndUpdate({ _id: KEY }, { $inc: { seq: 1 } }, { new: true }).lean();
      if (!counter) throw new Error('Employee code counter is missing.');
      const code = formatEmployeeCode(counter.seq);
      // A code made by hand after the seed could still equal this one: skip it.
      if (!(await this.users.existsByEmployeeCode(code))) return code;
    }
    throw new Error('Could not find a free employee code.');
  }

  private async ensureSeeded(): Promise<void> {
    if (await CounterModel.exists({ _id: KEY })) return;
    const rows = await UserModel.aggregate<{ max: number | null }>([
      { $match: { employeeCode: /^GHC\d+$/ } },
      { $group: { _id: null, max: { $max: { $toInt: { $substrBytes: ['$employeeCode', 3, 20] } } } } },
    ]);
    const start = Math.max(rows[0]?.max ?? 0, EMPLOYEE_CODE_FIRST - 1);
    try {
      await CounterModel.create({ _id: KEY, seq: start });
    } catch (error) {
      // Another request seeded it first: fine.
      if ((error as { code?: number }).code !== DUPLICATE_KEY) throw error;
    }
  }
}
