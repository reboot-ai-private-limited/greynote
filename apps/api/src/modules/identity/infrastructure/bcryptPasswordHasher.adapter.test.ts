import { describe, expect, it } from 'vitest';
import { BcryptPasswordHasher } from './bcryptPasswordHasher.adapter.js';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher(10); // low cost factor — this test only checks correctness, not timing

  it('round-trips a password: verify succeeds against its own hash', async () => {
    const hash = await hasher.hash('correct-horse-battery-staple');
    await expect(hasher.verify('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password against a real hash', async () => {
    const hash = await hasher.hash('correct-horse-battery-staple');
    await expect(hasher.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('never stores the plaintext in the hash output', async () => {
    const hash = await hasher.hash('correct-horse-battery-staple');
    expect(hash).not.toContain('correct-horse-battery-staple');
  });
});
