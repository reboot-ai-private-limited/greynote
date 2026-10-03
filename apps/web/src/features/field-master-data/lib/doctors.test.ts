import type { DoctorDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DOCTOR,
  buildDoctor,
  buildDoctorUpdate,
  canToggleStatus,
  distinctCategories,
  doctorToDraft,
  locationWasCorrected,
} from './doctors';

const doctor: DoctorDto = {
  id: 'd1',
  routeId: 'r1',
  category: 'A',
  name: 'Dr. S. Roy',
  address: 'Burdwan Road, Siliguri',
  email: 'roy@example.com',
  specialty: 'Cardiology',
  qualification: 'MD',
  location: { latitude: 26.7, longitude: 88.4 },
  capturedLocation: null,
  status: 'active',
  addedBy: 'admin1',
  clientRequestId: null,
  approvedAt: null,
  assignedTo: null,
};
const filled = doctorToDraft(doctor);

describe('buildDoctor', () => {
  it('builds a normalized body, sending a blank email as null', () => {
    expect(buildDoctor({ ...filled, name: '  Dr.  S. Roy ', email: ' ' })).toEqual({
      ok: true,
      body: {
        routeId: 'r1',
        category: 'A',
        name: 'Dr. S. Roy',
        address: 'Burdwan Road, Siliguri',
        specialty: 'Cardiology',
        qualification: 'MD',
        email: null,
        location: { latitude: 26.7, longitude: 88.4 },
      },
    });
  });
  it('allows no location', () => {
    expect(buildDoctor({ ...filled, coordinates: { latitude: '', longitude: '' } })).toMatchObject({ ok: true, body: { location: null } });
  });
  it('reports every missing field at once, and not the optional email', () => {
    const result = buildDoctor(EMPTY_DOCTOR);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['address', 'category', 'name', 'qualification', 'routeId', 'specialty']);
  });
  it('refuses a malformed email', () => {
    expect(buildDoctor({ ...filled, email: 'roy@' })).toMatchObject({ ok: false, errors: { email: 'Enter a valid email address.' } });
  });
  it('refuses over-long values', () => {
    expect(buildDoctor({ ...filled, specialty: 'x'.repeat(151) })).toMatchObject({ ok: false });
    expect(buildDoctor({ ...filled, category: 'x'.repeat(101) })).toMatchObject({ ok: false });
  });
});

describe('buildDoctorUpdate', () => {
  it('is empty when nothing changed', () => {
    expect(buildDoctorUpdate(doctor, filled)).toEqual({ ok: true, body: {} });
  });
  it('sends only what changed', () => {
    expect(buildDoctorUpdate(doctor, { ...filled, specialty: 'Neurology', category: 'B' })).toEqual({
      ok: true,
      body: { specialty: 'Neurology', category: 'B' },
    });
  });
  it('sends null to clear the email, and a value to set one', () => {
    expect(buildDoctorUpdate(doctor, { ...filled, email: '' })).toEqual({ ok: true, body: { email: null } });
    expect(buildDoctorUpdate({ ...doctor, email: null }, { ...filled, email: 'new@example.com' })).toEqual({ ok: true, body: { email: 'new@example.com' } });
  });
  it('does not resend a null email that stayed empty', () => {
    expect(buildDoctorUpdate({ ...doctor, email: null }, { ...filled, email: '' })).toEqual({ ok: true, body: {} });
  });
  it('sends a corrected location, and null when cleared', () => {
    expect(buildDoctorUpdate(doctor, { ...filled, coordinates: { latitude: '26.9', longitude: '88.5' } })).toMatchObject({
      body: { location: { latitude: 26.9, longitude: 88.5 } },
    });
    expect(buildDoctorUpdate(doctor, { ...filled, coordinates: { latitude: '', longitude: '' } })).toEqual({ ok: true, body: { location: null } });
  });
});

describe('status helpers', () => {
  it('lets Admin toggle an active or inactive Doctor but not a pending one', () => {
    expect(canToggleStatus('active')).toBe(true);
    expect(canToggleStatus('inactive')).toBe(true);
    expect(canToggleStatus('pending')).toBe(false);
  });
});

describe('locationWasCorrected', () => {
  const captured = { latitude: 26.7, longitude: 88.4 };
  it('is true only when both points exist and differ', () => {
    expect(locationWasCorrected({ location: { latitude: 26.8, longitude: 88.4 }, capturedLocation: captured })).toBe(true);
    expect(locationWasCorrected({ location: captured, capturedLocation: captured })).toBe(false);
    expect(locationWasCorrected({ location: null, capturedLocation: captured })).toBe(false);
    expect(locationWasCorrected({ location: captured, capturedLocation: null })).toBe(false);
  });
});

describe('distinctCategories', () => {
  it('lists each category once, sorted', () => {
    expect(distinctCategories([{ category: 'B' }, { category: 'A' }, { category: 'B' }])).toEqual(['A', 'B']);
  });
});
