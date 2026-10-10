import type { DoctorDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DOCTOR,
  buildDoctor,
  buildDoctorUpdate,
  doctorStepErrors,
  canToggleStatus,
  doctorToDraft,
  locationWasCorrected,
} from './doctors';

const doctor: DoctorDto = {
  id: 'd1',
  routeId: 'r1',
  name: 'Dr. S. Roy',
  address: 'Burdwan Road, Siliguri',
  email: 'roy@example.com',
  specialty: 'Cardiology',
  qualification: 'MD',
  dateOfBirth: null,
  anniversary: null,
  visitFrequency: null,
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
        name: 'Dr. S. Roy',
        address: 'Burdwan Road, Siliguri',
        specialty: 'Cardiology',
        qualification: 'MD',
        email: null,
        dateOfBirth: null,
        anniversary: null,
        visitFrequency: null,
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
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['address', 'name', 'qualification', 'routeId', 'specialty']);
  });
  it('refuses a malformed email', () => {
    expect(buildDoctor({ ...filled, email: 'roy@' })).toMatchObject({ ok: false, errors: { email: 'Enter a valid email address.' } });
  });
  it('refuses over-long values', () => {
    expect(buildDoctor({ ...filled, specialty: 'x'.repeat(151) })).toMatchObject({ ok: false });
  });
});

describe('buildDoctorUpdate', () => {
  it('is empty when nothing changed', () => {
    expect(buildDoctorUpdate(doctor, filled)).toEqual({ ok: true, body: {} });
  });
  it('sends only what changed', () => {
    expect(buildDoctorUpdate(doctor, { ...filled, specialty: 'Neurology', qualification: 'DM' })).toEqual({
      ok: true,
      body: { specialty: 'Neurology', qualification: 'DM' },
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


describe('doctorStepErrors', () => {
  it('the details step checks only the details, the location step only the point, the review step everything', () => {
    const empty = { ...filled, routeId: '', name: '', specialty: '', coordinates: { latitude: '95', longitude: '' } };
    expect(Object.keys(doctorStepErrors(empty, 'details')).sort()).toEqual(['name', 'routeId', 'specialty']);
    expect(Object.keys(doctorStepErrors(empty, 'location')).sort()).toEqual(['latitude', 'longitude']);
    expect(Object.keys(doctorStepErrors(empty, 'review')).sort()).toEqual(['latitude', 'longitude', 'name', 'routeId', 'specialty']);
  });
  it('a complete draft has no errors on any step; a doctor with no point yet is fine', () => {
    for (const step of ['details', 'location', 'review'] as const) expect(doctorStepErrors(filled, step)).toEqual({});
    expect(doctorStepErrors({ ...filled, coordinates: { latitude: '', longitude: '' } }, 'location')).toEqual({});
  });
});

describe('visit frequency and dates', () => {
  it('sends the frequency as a number and the dates as given, blank as null', () => {
    const built = buildDoctor({ ...filled, visitFrequency: '4', dateOfBirth: '1980-05-02', anniversary: '' });
    expect(built.ok && built.body).toMatchObject({ visitFrequency: 4, dateOfBirth: '1980-05-02', anniversary: null });
  });
  it('an update sends only the changed target, and null to clear it', () => {
    const withTarget = { ...doctor, visitFrequency: 3 };
    expect(buildDoctorUpdate(withTarget, doctorToDraft(withTarget))).toEqual({ ok: true, body: {} });
    const changed = buildDoctorUpdate(withTarget, { ...doctorToDraft(withTarget), visitFrequency: '' });
    expect(changed.ok && changed.body).toEqual({ visitFrequency: null });
  });
  it('refuses a date in the future or a malformed one', () => {
    expect(doctorStepErrors({ ...filled, dateOfBirth: '2999-01-01' }, 'details')['dateOfBirth']).toBeDefined();
    expect(doctorStepErrors({ ...filled, anniversary: '02/05/1980' }, 'details')['anniversary']).toBeDefined();
  });
});
