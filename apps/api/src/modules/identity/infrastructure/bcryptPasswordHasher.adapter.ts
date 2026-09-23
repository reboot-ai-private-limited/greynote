import bcrypt from 'bcrypt';
import type { PasswordHasherPort } from '../domain/passwordHasher.port.js';

export class BcryptPasswordHasher implements PasswordHasherPort {
  constructor(private readonly costFactor: number) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.costFactor);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
