import type { DoctorDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { DOCTORS_CSV_HEADER, doctorsCsv, employeeDoctorsFilename } from './doctorsCsv';

const doctor = (over: Partial<DoctorDto> = {}): DoctorDto => ({
  id: 'd1',
  routeId: 'r1',
  name: 'Dr Mehta',
  address: '12, MG Road',
  email: null,
  clinicName: 'Mehta Clinic',
  phone: '9800000000',
  photoUrl: null,
  specialty: 'Cardiology',
  qualification: 'MD',
  dateOfBirth: null,
  anniversary: null,
  visitFrequency: 2,
  location: null,
  capturedLocation: null,
  status: 'active',
  addedBy: 'admin',
  clientRequestId: null,
  approvedAt: null,
  assignedTo: { userId: 'u1', name: 'Asha Rao', employeeCode: 'MR001' },
  approvalRequestId: null,
  ...over,
});

describe('doctorsCsv', () => {
  it('is the header, then one row per doctor with the route by name and the MR by name and code', () => {
    const lines = doctorsCsv([doctor()], () => 'Salt Lake').trimEnd().split('\r\n');
    expect(lines[0]).toBe(DOCTORS_CSV_HEADER.join(','));
    expect(lines[1]).toBe('Dr Mehta,Cardiology,MD,Mehta Clinic,9800000000,,"12, MG Road",Salt Lake,Active,2,Asha Rao,MR001,,');
  });

  it('leaves the MR cells empty for an unassigned doctor, and is only the header for none', () => {
    expect(doctorsCsv([doctor({ assignedTo: null })], () => 'R').split('\r\n')[1]).toContain(',2,,,');
    expect(doctorsCsv([], () => 'R').trimEnd().split('\r\n')).toHaveLength(1);
  });

  it('writes a name that looks like a formula as text', () => {
    expect(doctorsCsv([doctor({ name: '=HYPERLINK("x")' })], () => 'R')).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('employeeDoctorsFilename', () => {
  it('carries the employee code in lower case', () => expect(employeeDoctorsFilename('MR001')).toBe('doctors-mr001.csv'));
});
