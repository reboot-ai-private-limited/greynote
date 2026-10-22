import type { DoctorDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_DOCTOR, buildDoctor, buildDoctorUpdate, canToggleStatus, doctorImpactLines, doctorStepErrors, doctorToDraft, locationWasCorrected, pendingApprovalHref } from './doctors';

const doctor: DoctorDto = {
  id: 'd1',
  routeId: 'r1',
  name: 'Dr. S. Roy',
  address: 'Burdwan Road, Siliguri',
  email: 'roy@example.com',
  specialty: 'Cardiology',
  qualification: 'MD',
  clinicName: null, phone: null, dateOfBirth: null,
  anniversary: null,
  visitFrequency: null,
  location: { latitude: 26.7, longitude: 88.4 },
  capturedLocation: null,
  status: 'active',
  addedBy: 'admin1',
  clientRequestId: null,
  approvedAt: null,
  assignedTo: null,
  approvalRequestId: null,
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
        clinicName: null,
        phone: null,
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

describe('clinic name and phone', () => {
  it('are optional, and a bad phone is reported', () => {
    expect(buildDoctor({ ...filled, clinicName: ' City  Clinic ', phone: '98765 43210' })).toMatchObject({ ok: true, body: { clinicName: 'City Clinic', phone: '9876543210' } });
    expect(buildDoctor({ ...filled, phone: '123' })).toMatchObject({ ok: false });
  });
});

describe('doctorImpactLines', () => {
  const none = { id: 'd1', name: 'Dr Rao', status: 'active' as const, assignedTo: null, plannedDays: { editable: 0, locked: 0 }, calls: 0, openGifts: 0, openServices: 0, sampleAllocations: 0, samplesRemaining: 0, visuals: 0 };
  it('says nothing for an unused doctor, apart from the delete itself', () => {
    expect(doctorImpactLines(none, 'deactivate')).toEqual({ changes: [], open: [], history: [] });
    expect(doctorImpactLines(none, 'delete').changes).toEqual(['The doctor is removed for good and kept only in the archive']);
  });
  it('names the MR, the plans, what stays open and the history', () => {
    const lines = doctorImpactLines(
      { ...none, assignedTo: { userId: 'u1', name: 'Asha Rao', employeeCode: 'GHC001' }, plannedDays: { editable: 3, locked: 1 }, calls: 1, openGifts: 2, openServices: 1, sampleAllocations: 2, samplesRemaining: 9, visuals: 1 },
      'deactivate',
    );
    expect(lines.changes).toEqual(['Asha Rao (GHC001) loses this doctor: the assignment ends', 'It is taken off 3 plans from today that are not submitted yet']);
    expect(lines.open).toEqual([
      '1 submitted or approved plan from today keeps it, but it can’t be called',
      '2 gifts not handed over yet',
      '1 service not done yet',
      '9 sample units left on 2 allocations',
      '1 visual picked for it',
    ]);
    expect(lines.history).toEqual(['1 past call keeps showing it']);
  });
});

describe('pendingApprovalHref', () => {
  it('opens the doctor’s own request, else the NEW_DOCTOR queue', () => {
    expect(pendingApprovalHref({ approvalRequestId: 'r1' })).toBe('/approvals/r1');
    expect(pendingApprovalHref({ approvalRequestId: null })).toBe('/approvals?kind=NEW_DOCTOR');
  });
});

