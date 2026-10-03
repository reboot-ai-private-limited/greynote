import type { PlaceDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { samePlace, toPlace } from './place';

const siliguri: PlaceDto = { label: 'Siliguri', latitude: 26.71, longitude: 88.43, placeId: 'p-sil' };

describe('samePlace', () => {
  it('is true for the same pin, false for another', () => {
    expect(samePlace(siliguri, { ...siliguri })).toBe(true);
    expect(samePlace(siliguri, { ...siliguri, placeId: 'p-other' })).toBe(false);
    expect(samePlace(siliguri, { ...siliguri, latitude: 26.72 })).toBe(false);
  });
  it('treats two missing places as the same, and a missing one as different from a real one', () => {
    expect(samePlace(null, undefined)).toBe(true);
    expect(samePlace(siliguri, null)).toBe(false);
    expect(samePlace(undefined, siliguri)).toBe(false);
  });
});

describe('toPlace', () => {
  it('keeps only the four fields the API stores — not the address', () => {
    expect(toPlace({ ...siliguri, address: 'Siliguri, West Bengal' } as never)).toEqual(siliguri);
  });
});
