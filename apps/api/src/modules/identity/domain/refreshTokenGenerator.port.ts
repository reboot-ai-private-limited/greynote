/**
 * Refresh tokens are opaque random strings hashed with SHA-256, not bcrypt — they already carry
 * 256 bits of entropy, so bcrypt's deliberately-slow cost buys nothing and its 72-byte input cap
 * is an irrelevant constraint here.
 */
export interface RefreshTokenGeneratorPort {
  generate(): string;
  hash(token: string): string;
}
