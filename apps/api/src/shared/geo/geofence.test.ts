import { describe, expect, it } from 'vitest';
import { evaluateGeofence, haversineMeters, type GeofenceInput } from './geofence.js';

// A clinic in Siliguri, and points a known number of meters away (1° of latitude ≈ 111,195 m).
const clinic = { latitude: 26.7271, longitude: 88.3953 };
const metersNorth = (m: number) => ({ latitude: clinic.latitude + m / 111_195, longitude: clinic.longitude });
const metersEast = (m: number) => ({
  latitude: clinic.latitude,
  longitude: clinic.longitude + m / (111_195 * Math.cos((clinic.latitude * Math.PI) / 180)),
});

const check = (over: Partial<GeofenceInput> = {}) =>
  evaluateGeofence({ registered: clinic, captured: clinic, accuracyMeters: 10, radiusMeters: 200, maxAccuracyMeters: 100, ...over });

describe('haversineMeters', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineMeters(clinic, clinic)).toBe(0);
    expect(haversineMeters(clinic, metersNorth(500))).toBeCloseTo(haversineMeters(metersNorth(500), clinic), 6);
  });

  it('measures short distances in any direction', () => {
    expect(haversineMeters(clinic, metersNorth(150))).toBeCloseTo(150, 0);
    expect(haversineMeters(clinic, metersEast(150))).toBeCloseTo(150, 0);
  });

  it('matches a known long distance: Delhi to Mumbai is about 1,150 km', () => {
    const km = haversineMeters({ latitude: 28.6139, longitude: 77.209 }, { latitude: 19.076, longitude: 72.8777 }) / 1000;
    expect(km).toBeGreaterThan(1140);
    expect(km).toBeLessThan(1160);
  });

  it('crosses the antimeridian and the poles without blowing up', () => {
    expect(haversineMeters({ latitude: 0, longitude: 179.9999 }, { latitude: 0, longitude: -179.9999 })).toBeLessThan(30);
    expect(haversineMeters({ latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 })).toBeCloseTo(20_015_087, -3);
  });
});

describe('evaluateGeofence', () => {
  it('PASS inside the radius, including the boundary; FAIL outside it', () => {
    expect(check({ captured: metersNorth(150) })).toMatchObject({ status: 'PASS', distanceMeters: 150, reason: null });
    expect(check({ captured: metersNorth(200), radiusMeters: 200 }).status).toBe('PASS');
    expect(check({ captured: metersNorth(201) })).toMatchObject({ status: 'FAIL', distanceMeters: 201 });
    expect(check({ captured: metersEast(1000) })).toMatchObject({ status: 'FAIL', distanceMeters: 1000 });
  });

  it('follows the radius it is given — the client may move it from 200 m to 100 m', () => {
    const near = metersNorth(150);
    expect(check({ captured: near, radiusMeters: 200 }).status).toBe('PASS');
    expect(check({ captured: near, radiusMeters: 100 }).status).toBe('FAIL');
  });

  it('UNVERIFIED, with nothing to measure, when the Doctor or Chemist has no registered location', () => {
    expect(check({ registered: null })).toEqual({ status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_REGISTERED_LOCATION' });
    expect(check({ registered: null, captured: metersNorth(5000), accuracyMeters: 500 }).reason).toBe('NO_REGISTERED_LOCATION');
  });

  it('UNVERIFIED for a weak reading either way — near or far — but still reports the distance', () => {
    expect(check({ accuracyMeters: 250, captured: metersNorth(20) })).toEqual({ status: 'UNVERIFIED', distanceMeters: 20, reason: 'LOW_ACCURACY' });
    expect(check({ accuracyMeters: 250, captured: metersNorth(900) })).toMatchObject({ status: 'UNVERIFIED', distanceMeters: 900 });
  });

  it('a reading exactly at the accuracy limit still counts; one with no accuracy is taken at face value', () => {
    expect(check({ accuracyMeters: 100, captured: metersNorth(50) }).status).toBe('PASS');
    expect(check({ accuracyMeters: 101, captured: metersNorth(50) }).status).toBe('UNVERIFIED');
    expect(check({ accuracyMeters: null, captured: metersNorth(50) }).status).toBe('PASS');
    expect(check({ accuracyMeters: null, captured: metersNorth(500) }).status).toBe('FAIL');
  });

  it('is deterministic — the server recomputes and gets the phone’s answer for the same inputs', () => {
    const input: GeofenceInput = { registered: clinic, captured: metersEast(180), accuracyMeters: 15, radiusMeters: 200, maxAccuracyMeters: 100 };
    expect(evaluateGeofence(input)).toEqual(evaluateGeofence({ ...input }));
  });
});
