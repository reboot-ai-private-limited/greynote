import { AppError } from '@/shared/errors/AppError.js';
import type { HolidayRepositoryPort } from '../../domain/holiday.repository.port.js';

/** Removing a holiday doesn't change leave already requested — its counted days are stored. */
export class DeleteHolidayUseCase {
  constructor(private readonly holidays: HolidayRepositoryPort) {}

  async execute(id: string): Promise<void> {
    if (!(await this.holidays.delete(id))) throw AppError.notFound('No such holiday.');
  }
}
