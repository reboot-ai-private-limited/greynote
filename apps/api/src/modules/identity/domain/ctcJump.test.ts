import { describe, expect, it } from 'vitest';
import { ctcJumpWarning } from './ctcJump.js';

describe('ctcJumpWarning', () => {
  it('says nothing for a first CTC, a cut, or a rise within the limit (the limit itself is fine)', () => {
    expect(ctcJumpWarning(null, 90_000_000, 50)).toBeNull();
    expect(ctcJumpWarning(10_000_000, 5_000_000, 50)).toBeNull();
    expect(ctcJumpWarning(10_000_000, 15_000_000, 50)).toBeNull();
  });

  it('warns above the limit and names the previous CTC', () => {
    expect(ctcJumpWarning(10_000_000, 15_000_001, 50)).toMatch(/more than 50%.*1,00,000/);
    expect(ctcJumpWarning(1_200_000, 12_000_000, 50)).not.toBeNull();
  });
});
