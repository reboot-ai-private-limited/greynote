import { describe, expect, it } from 'vitest';
import { generatePassword } from './passwordGenerator.js';

describe('generatePassword', () => {
  it('is 12 characters with a lower-case, an upper-case and a digit, and no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(12);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });

  it('is never shorter than 8', () => {
    expect(generatePassword(3)).toHaveLength(8);
  });
});
