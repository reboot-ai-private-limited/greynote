import { describe, expect, it } from 'vitest';
import { LeaverWork } from '../leaverWork.js';
import { AssignDoctorUseCase } from './assignDoctor.usecase.js';
import { FakeAssignments, FakeDistributors, FakeDoctors, FakeTerritory, FakeTransactions, FakeUsers, retirementKit } from './fmdTestKit.js';

describe('a leaver’s doctors and distributors', () => {
  it('hands each doctor to the receiver where they have the route, leaves the rest unassigned, and takes them off distributors', async () => {
    const assignments = new FakeAssignments();
    const doctors = new FakeDoctors(assignments);
    const users = new FakeUsers();
    const territory = new FakeTerritory();
    const distributors = new FakeDistributors();
    const { retirement, references } = retirementKit(doctors, assignments, users);
    const assign = new AssignDoctorUseCase(doctors, assignments, users, territory, new FakeTransactions(), retirement);
    const doctor = (id: string, routeId: string) =>
      doctors.rows.push({ id, routeId, name: id, address: 'a', email: null, clinicName: null, phone: null, photo: null, specialty: 'ENT', qualification: 'MBBS', dateOfBirth: null, anniversary: null, visitFrequency: null, location: null, capturedLocation: null, status: 'active', addedBy: 'admin', clientRequestId: null, approvedAt: new Date() });
    doctor('d1', 'route-1');
    doctor('d2', 'route-2');
    territory.userRoutes.set('mr1', ['route-1', 'route-2']);
    territory.userRoutes.set('mr2', ['route-1']); // the receiver has only route-1
    await assign.execute('d1', 'mr1', 'admin');
    await assign.execute('d2', 'mr1', 'admin');
    distributors.rows.push({ id: 'dist1', assignedUserIds: ['mr1', 'mr9'] } as never);

    const work = new LeaverWork(doctors, assignments, distributors, territory, assign, retirement);
    expect(await work.count('mr1')).toEqual({ doctors: 2, distributors: 1 });
    expect(await work.releaseDoctors('mr1', 'mr2', 'admin')).toEqual({ handedOver: 1, unassigned: 1 });
    expect((await assignments.findActiveForDoctor('d1'))?.userId).toBe('mr2');
    expect(await assignments.findActiveForDoctor('d2')).toBeNull();
    // Both doctors left the leaver's editable plans: d1 through the reassignment, d2 through the unassignment.
    expect(references.released).toEqual([{ doctorId: 'd1', userId: 'mr1' }, { doctorId: 'd2', userId: 'mr1' }]);
    expect(await work.releaseDistributors('mr1')).toBe(1);
    expect(distributors.rows[0]!.assignedUserIds).toEqual(['mr9']);
    expect(await work.releaseDoctors('mr1', 'mr2', 'admin')).toEqual({ handedOver: 0, unassigned: 0 });
  });
});
