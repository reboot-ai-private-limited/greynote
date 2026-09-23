import { AppError } from '@/shared/errors/AppError.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import type { UserSessionRepositoryPort } from '../../domain/userSession.repository.port.js';

export class GetActiveDeviceCountUseCase {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly userSessionRepository: UserSessionRepositoryPort,
  ) {}

  async execute(userId: string): Promise<number> {
    if (!(await this.userRepository.findById(userId))) throw AppError.notFound();
    return this.userSessionRepository.countActive(userId);
  }
}
