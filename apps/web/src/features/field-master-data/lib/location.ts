import type { GeoPoint } from '@greynote/contracts';

/**
 * A registered point is both coordinates or neither (the API refuses half of one). The picker keeps
 * the two as strings while they are typed and turns them into a point here.
 */
export interface CoordinateInputs {
  latitude: string;
  longitude: string;
}

export const EMPTY_COORDINATES: CoordinateInputs = { latitude: '', longitude: '' };

export type PointResult =
  | { ok: true; point: GeoPoint | null }
  | { ok: false; errors: { latitude?: string; longitude?: string } };

/** Six decimals is about 10 cm: enough for a doorstep, and short enough to read. */
const DECIMALS = 6;

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(DECIMALS));
}

export function pointToInputs(point: GeoPoint | null | undefined): CoordinateInputs {
  return point ? { latitude: String(roundCoordinate(point.latitude)), longitude: String(roundCoordinate(point.longitude)) } : { ...EMPTY_COORDINATES };
}

const NUMBER = /^[+-]?\d+(\.\d+)?$/;

function coordinateError(raw: string, name: string, limit: number): string | undefined {
  if (!NUMBER.test(raw)) return `Enter ${name} as a number, e.g. 26.7271.`;
  return Math.abs(Number(raw)) > limit ? `${name[0]?.toUpperCase()}${name.slice(1)} is between -${limit} and ${limit}.` : undefined;
}

/**
 * Both blank is "no location" (allowed: the record is added now and the point set later). One blank,
 * or either out of range or not a number, is an error on that field.
 */
export function pointFromInputs(inputs: CoordinateInputs): PointResult {
  const lat = inputs.latitude.trim();
  const lng = inputs.longitude.trim();
  if (lat === '' && lng === '') return { ok: true, point: null };
  const errors: { latitude?: string; longitude?: string } = {};
  const latError = lat === '' ? 'Enter the latitude too.' : coordinateError(lat, 'latitude', 90);
  const lngError = lng === '' ? 'Enter the longitude too.' : coordinateError(lng, 'longitude', 180);
  if (latError) errors.latitude = latError;
  if (lngError) errors.longitude = lngError;
  if (latError || lngError) return { ok: false, errors };
  return { ok: true, point: { latitude: roundCoordinate(Number(lat)), longitude: roundCoordinate(Number(lng)) } };
}

export function samePoint(a: GeoPoint | null | undefined, b: GeoPoint | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return roundCoordinate(a.latitude) === roundCoordinate(b.latitude) && roundCoordinate(a.longitude) === roundCoordinate(b.longitude);
}

/** `26.7271, 88.3953`, or a plain "Not set". */
export function formatPoint(point: GeoPoint | null | undefined): string {
  return point ? `${roundCoordinate(point.latitude)}, ${roundCoordinate(point.longitude)}` : 'Not set';
}

/**
 * The body field for a location on an edit: absent when unchanged, the point when it changed, and
 * `null` when it was cleared (the API reads `null` as "clear it").
 */
export function locationChange(before: GeoPoint | null | undefined, after: GeoPoint | null): { location?: GeoPoint | null } {
  return samePoint(before, after) ? {} : { location: after };
}
