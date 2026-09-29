import { describe, expect, it } from 'vitest';
import { NEW_DOCTOR_REASON_CODES, SYNC_RECORD_KINDS, type FieldMasterDataSnapshot, type NewDoctorPayload } from '@greynote/contracts';
import { NEW_DOCTOR_SYNC_CODES, NEW_DOCTOR_SYNC_KIND } from '../application/newDoctorSync.js';
import { editAddedDoctorBodySchema } from './field-master-data.schemas.js';

/** Pins Field Master Data to `@greynote/contracts` — what the phone sends for a Doctor, and the refusals it gets back. */
describe('NEW_DOCTOR against the shared contract', () => {
  it('the server accepts a NEW_DOCTOR payload exactly as the contract types it, with and without the optional email', () => {
    const payload: NewDoctorPayload = { routeId: 'a'.repeat(24), category: 'A', name: 'Dr X', address: 'Rd', specialty: 'ENT', qualification: 'MS', location: { latitude: 26.7, longitude: 88.4 } };
    expect(editAddedDoctorBodySchema.parse(payload)).toMatchObject({ name: 'Dr X', email: null });
    expect(editAddedDoctorBodySchema.parse({ ...payload, email: 'x@example.com' }).email).toBe('x@example.com');
    expect(editAddedDoctorBodySchema.parse({ ...payload, email: null }).email).toBeNull();
  });

  it('the kind and the refusal codes are the contract’s, value for value', () => {
    expect([...SYNC_RECORD_KINDS]).toEqual([NEW_DOCTOR_SYNC_KIND]);
    expect([...NEW_DOCTOR_REASON_CODES].sort()).toEqual(Object.values(NEW_DOCTOR_SYNC_CODES).sort());
  });

  it('the snapshot type exists for the phone to read (its builder is compiled against it)', () => {
    const empty: FieldMasterDataSnapshot = { doctors: [], pendingDoctors: [], chemists: [], distributors: [], products: [], sampleAllocations: [] };
    expect(Object.keys(empty)).toEqual(['doctors', 'pendingDoctors', 'chemists', 'distributors', 'products', 'sampleAllocations']);
  });
});
