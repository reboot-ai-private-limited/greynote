import { AppError } from '@/shared/errors/AppError.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/** The compliance-block flag (HLD 10) — what submit use cases in other modules check. */
export class IsBlockedUseCase {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async execute(userId: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw AppError.notFound();
    return user.isBlocked;
  }
}
