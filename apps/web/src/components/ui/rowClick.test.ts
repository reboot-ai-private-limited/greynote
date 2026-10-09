import { describe, expect, it } from 'vitest';
import { isInteractiveTarget } from './rowClick';

/** A stand-in for a DOM element: `closest` finds an interactive ancestor, or nothing. */
const element = (insideInteractive: boolean) =>
  ({ closest: () => (insideInteractive ? {} : null) }) as unknown as EventTarget;

describe('isInteractiveTarget', () => {
  it('is true on a link, button or field, or anything inside one', () => {
    expect(isInteractiveTarget(element(true))).toBe(true);
  });

  it('is false on a plain cell, and on nothing', () => {
    expect(isInteractiveTarget(element(false))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget({} as EventTarget)).toBe(false);
  });
});
