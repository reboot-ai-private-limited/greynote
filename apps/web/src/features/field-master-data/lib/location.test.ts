import { describe, expect, it } from 'vitest';
import { formatPoint, locationChange, pointFromInputs, pointToInputs, roundCoordinate, samePoint } from './location';

describe('pointFromInputs', () => {
  it('turns two numbers into a point, rounded to six decimals', () => {
    expect(pointFromInputs({ latitude: ' 26.7271 ', longitude: '88.39531234' })).toEqual({
      ok: true,
      point: { latitude: 26.7271, longitude: 88.395312 },
    });
  });
  it('treats both blank as no location', () => {
    expect(pointFromInputs({ latitude: '', longitude: '  ' })).toEqual({ ok: true, point: null });
  });
  it('asks for the other coordinate when only one is given', () => {
    expect(pointFromInputs({ latitude: '26.7', longitude: '' })).toEqual({ ok: false, errors: { longitude: 'Enter the longitude too.' } });
    expect(pointFromInputs({ latitude: '', longitude: '88.3' })).toEqual({ ok: false, errors: { latitude: 'Enter the latitude too.' } });
  });
  it('refuses text, and values outside the globe', () => {
    expect(pointFromInputs({ latitude: 'north', longitude: '88' })).toMatchObject({ ok: false, errors: { latitude: expect.stringMatching(/number/) } });
    expect(pointFromInputs({ latitude: '91', longitude: '88' })).toMatchObject({ ok: false, errors: { latitude: expect.stringMatching(/-90 and 90/) } });
    expect(pointFromInputs({ latitude: '26', longitude: '-181' })).toMatchObject({ ok: false, errors: { longitude: expect.stringMatching(/-180 and 180/) } });
  });
  it('accepts the exact limits and negatives, and reports both fields at once', () => {
    expect(pointFromInputs({ latitude: '-90', longitude: '180' })).toMatchObject({ ok: true });
    const result = pointFromInputs({ latitude: 'x', longitude: 'y' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['latitude', 'longitude']);
  });
  it('refuses a number written with a comma or an exponent', () => {
    expect(pointFromInputs({ latitude: '26,7', longitude: '88' })).toMatchObject({ ok: false });
    expect(pointFromInputs({ latitude: '1e1', longitude: '88' })).toMatchObject({ ok: false });
  });
});

describe('pointToInputs / formatPoint', () => {
  it('round-trips a point', () => {
    const inputs = pointToInputs({ latitude: 26.7271, longitude: 88.3953 });
    expect(pointFromInputs(inputs)).toEqual({ ok: true, point: { latitude: 26.7271, longitude: 88.3953 } });
  });
  it('gives blanks for no point, and says so in words', () => {
    expect(pointToInputs(null)).toEqual({ latitude: '', longitude: '' });
    expect(formatPoint(null)).toBe('Not set');
    expect(formatPoint({ latitude: 26.7271, longitude: 88.3953 })).toBe('26.7271, 88.3953');
  });
});

describe('samePoint / locationChange', () => {
  const a = { latitude: 26.7271, longitude: 88.3953 };
  it('ignores differences below the rounding', () => {
    expect(samePoint(a, { latitude: 26.72710000001, longitude: 88.3953 })).toBe(true);
    expect(samePoint(a, { latitude: 26.7272, longitude: 88.3953 })).toBe(false);
  });
  it('treats two nulls as the same and null against a point as different', () => {
    expect(samePoint(null, undefined)).toBe(true);
    expect(samePoint(a, null)).toBe(false);
  });
  it('sends nothing when unchanged, the point when moved, and null when cleared', () => {
    expect(locationChange(a, a)).toEqual({});
    expect(locationChange(null, null)).toEqual({});
    expect(locationChange(a, { latitude: 27, longitude: 88 })).toEqual({ location: { latitude: 27, longitude: 88 } });
    expect(locationChange(a, null)).toEqual({ location: null });
    expect(locationChange(null, a)).toEqual({ location: a });
  });
});

describe('roundCoordinate', () => {
  it('keeps six decimals', () => {
    expect(roundCoordinate(1.23456789)).toBe(1.234568);
  });
});
