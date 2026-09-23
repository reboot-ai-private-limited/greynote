import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenGeneratorPort } from '../domain/refreshTokenGenerator.port.js';

export class CryptoRefreshTokenGenerator implements RefreshTokenGeneratorPort {
  generate(): string {
    return randomBytes(32).toString('hex');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
