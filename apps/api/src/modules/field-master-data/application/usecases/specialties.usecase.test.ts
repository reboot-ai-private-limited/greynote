import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/shared/errors/AppError.js';
import { DoctorViews } from '../doctorViews.js';
import { SpecialtyCatalog } from '../specialtyCatalog.js';
import { CreateDoctorUseCase } from './createDoctor.usecase.js';
import { FakeAssignments, FakeDoctors, FakeSpecialties, FakeTerritory, FakeTransactions, FakeUsers, retirementKit } from './fmdTestKit.js';
import { CreateSpecialtyUseCase, ListSpecialtiesUseCase, UpdateSpecialtyUseCase } from './specialties.usecase.js';
import { UpdateDoctorUseCase } from './updateDoctor.usecase.js';

const status = (p: Promise<unknown>) => p.then(() => 0, (e: unknown) => (e as AppError).statusCode);
const page = { page: 1, pageSize: 50 };

describe('specialities (decision-log 2026-10-06)', () => {
  let specialties: FakeSpecialties;
  let doctors: FakeDoctors;
  let assignments: FakeAssignments;
  let catalog: SpecialtyCatalog;
  let createDoctor: CreateDoctorUseCase;
  let updateDoctor: UpdateDoctorUseCase;
  const input = { routeId: 'route-1', name: 'Dr Rao', address: '5 Clinic Rd', email: null, specialty: 'ent', qualification: 'MS', location: null };

  beforeEach(() => {
    specialties = new FakeSpecialties(['ENT', 'Cardiologist']);
    assignments = new FakeAssignments();
    doctors = new FakeDoctors(assignments);
    catalog = new SpecialtyCatalog(specialties);
    const territory = new FakeTerritory();
    const views = new DoctorViews(assignments, new FakeUsers());
    createDoctor = new CreateDoctorUseCase(doctors, territory, views, catalog);
    updateDoctor = new UpdateDoctorUseCase(doctors, assignments, territory, views, catalog, new FakeTransactions(), retirementKit(doctors, assignments, new FakeUsers()).retirement);
  });

  it('adds a speciality, refusing the same name in any case or with spaces', async () => {
    const create = new CreateSpecialtyUseCase(specialties);
    expect((await create.execute({ name: 'Dermatologist' })).status).toBe('active');
    expect(await status(create.execute({ name: ' dermatologist ' }))).toBe(409);
  });

  it('lists by search and status', async () => {
    await new UpdateSpecialtyUseCase(specialties, doctors).execute('sp-2', { status: 'inactive' });
    const list = new ListSpecialtiesUseCase(specialties);
    expect((await list.execute({ ...page, status: 'active' })).items.map((s) => s.name)).toEqual(['ENT']);
    expect((await list.execute({ ...page, search: 'cardio' })).total).toBe(1);
  });

  it('a doctor’s speciality must be on the list, and is stored in the list’s spelling', async () => {
    expect((await createDoctor.execute(input, 'admin')).specialty).toBe('ENT');
    expect(await status(createDoctor.execute({ ...input, specialty: 'Astrology' }, 'admin'))).toBe(400);
  });

  it('an inactive speciality is not offered to a new doctor, but doctors who have it keep it', async () => {
    const d = await createDoctor.execute(input, 'admin');
    await new UpdateSpecialtyUseCase(specialties, doctors).execute('sp-1', { status: 'inactive' });
    expect(await status(createDoctor.execute({ ...input, name: 'Dr New' }, 'admin'))).toBe(400);
    expect((await doctors.findById(d.id))!.specialty).toBe('ENT');
    // Editing something else on that doctor does not re-check the speciality it already has.
    expect((await updateDoctor.execute(d.id, { qualification: 'MS, DLO' })).specialty).toBe('ENT');
  });

  it('changing a doctor’s speciality checks the new one; setting the same one in another case is not a change', async () => {
    const d = await createDoctor.execute(input, 'admin');
    expect(await status(updateDoctor.execute(d.id, { specialty: 'Cardiologyy' }))).toBe(400);
    expect((await updateDoctor.execute(d.id, { specialty: 'cardiologist' })).specialty).toBe('Cardiologist');
    expect((await updateDoctor.execute(d.id, { specialty: 'CARDIOLOGIST' })).specialty).toBe('Cardiologist');
  });

  it('an older doctor whose free-text speciality is not on the list can still be edited, until the speciality itself is changed', async () => {
    const legacy = await doctors.create({ ...input, specialty: 'Cardio-vascular surgeon', clinicName: null, phone: null, photo: null, dateOfBirth: null, anniversary: null, visitFrequency: null, capturedLocation: null, clientRequestId: null, status: 'active', addedBy: 'admin', approvedAt: new Date() });
    expect((await updateDoctor.execute(legacy.id, { name: 'Dr Rao Jr' })).name).toBe('Dr Rao Jr');
    expect((await updateDoctor.execute(legacy.id, { specialty: 'Cardio-vascular surgeon' })).specialty).toBe('Cardio-vascular surgeon');
    expect(await status(updateDoctor.execute(legacy.id, { specialty: 'Heart' }))).toBe(400);
  });

  it('renaming a speciality renames it on its doctors, whatever case they had', async () => {
    const a = await createDoctor.execute(input, 'admin');
    const b = await doctors.create({ ...input, name: 'Dr Old', specialty: ' ent', clinicName: null, phone: null, photo: null, dateOfBirth: null, anniversary: null, visitFrequency: null, capturedLocation: null, clientRequestId: null, status: 'active', addedBy: 'admin', approvedAt: new Date() });
    const other = await createDoctor.execute({ ...input, name: 'Dr Heart', specialty: 'Cardiologist' }, 'admin');
    const renamed = await new UpdateSpecialtyUseCase(specialties, doctors).execute('sp-1', { name: 'ENT Specialist' });
    expect(renamed.name).toBe('ENT Specialist');
    expect((await doctors.findById(a.id))!.specialty).toBe('ENT Specialist');
    expect((await doctors.findById(b.id))!.specialty).toBe('ENT Specialist');
    expect((await doctors.findById(other.id))!.specialty).toBe('Cardiologist');
  });

  it('refuses renaming onto another speciality’s name, and an unknown id', async () => {
    const update = new UpdateSpecialtyUseCase(specialties, doctors);
    expect(await status(update.execute('sp-1', { name: 'cardiologist' }))).toBe(409);
    expect(await status(update.execute('nope', { name: 'x' }))).toBe(404);
  });
});
