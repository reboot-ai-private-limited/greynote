import { describe, expect, it } from 'vitest';
import type { DocumentStoragePort } from '../../domain/documentStorage.port.js';
import type { EmployeeProfile, UserDocument } from '../../domain/employeeProfile.entity.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import { RemoveUserDocumentUseCase } from './removeUserDocument.usecase.js';

const DOCUMENT: UserDocument = {
  id: 'doc-1',
  type: 'AADHAAR',
  url: 'https://cloudinary.example/doc-1.pdf',
  publicId: 'greynote/users/user-1/documents/doc-1',
  uploadedAt: new Date(),
};

function makeProfile(documents: UserDocument[]): EmployeeProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    designationId: null,
    payBandId: null,
    managerId: null,
    dateOfJoining: null,
    probationMonths: null,
    esiNumber: null,
    mobileNumber: null,
    guardianName: null,
    dateOfBirth: null,
    address: null,
    qualification: null,
    bankDetails: null,
    documents,
  };
}

class FakeEmployeeProfileRepository implements Pick<EmployeeProfileRepositoryPort, 'findByUserId' | 'upsert'> {
  updates: Array<{ userId: string; input: Partial<EmployeeProfile> }> = [];
  constructor(private profile: EmployeeProfile | null) {}
  async findByUserId(): Promise<EmployeeProfile | null> {
    return this.profile;
  }
  async upsert(userId: string, input: Partial<EmployeeProfile>): Promise<EmployeeProfile> {
    this.updates.push({ userId, input });
    this.profile = { ...(this.profile as EmployeeProfile), ...input };
    return this.profile;
  }
}

describe('RemoveUserDocumentUseCase', () => {
  it('removes from storage before touching the DB record, then clears the document from the array', async () => {
    const calls: string[] = [];
    const employeeProfileRepository = new FakeEmployeeProfileRepository(makeProfile([DOCUMENT]));
    const originalUpsert = employeeProfileRepository.upsert.bind(employeeProfileRepository);
    employeeProfileRepository.upsert = async (userId, input) => {
      calls.push('db.update');
      return originalUpsert(userId, input);
    };
    const documentStorage: Pick<DocumentStoragePort, 'remove'> = {
      remove: async () => {
        calls.push('storage.remove');
      },
    };
    const useCase = new RemoveUserDocumentUseCase(
      employeeProfileRepository as unknown as EmployeeProfileRepositoryPort,
      documentStorage as DocumentStoragePort,
    );

    await useCase.execute('user-1', 'doc-1');

    expect(calls).toEqual(['storage.remove', 'db.update']);
    expect(employeeProfileRepository.updates[0]?.input.documents).toEqual([]);
  });

  it('does not touch the DB record when storage removal fails', async () => {
    const employeeProfileRepository = new FakeEmployeeProfileRepository(makeProfile([DOCUMENT]));
    const documentStorage: Pick<DocumentStoragePort, 'remove'> = {
      remove: async () => {
        throw new Error('Cloudinary is down');
      },
    };
    const useCase = new RemoveUserDocumentUseCase(
      employeeProfileRepository as unknown as EmployeeProfileRepositoryPort,
      documentStorage as DocumentStoragePort,
    );

    await expect(useCase.execute('user-1', 'doc-1')).rejects.toThrow('Cloudinary is down');
    expect(employeeProfileRepository.updates).toHaveLength(0);
  });

  it('404s when the document id does not exist on the profile', async () => {
    const employeeProfileRepository = new FakeEmployeeProfileRepository(makeProfile([]));
    const documentStorage: Pick<DocumentStoragePort, 'remove'> = { remove: async () => {} };
    const useCase = new RemoveUserDocumentUseCase(
      employeeProfileRepository as unknown as EmployeeProfileRepositoryPort,
      documentStorage as DocumentStoragePort,
    );

    await expect(useCase.execute('user-1', 'missing-doc')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('404s when the user has no EmployeeProfile at all yet', async () => {
    const employeeProfileRepository = new FakeEmployeeProfileRepository(null);
    const documentStorage: Pick<DocumentStoragePort, 'remove'> = { remove: async () => {} };
    const useCase = new RemoveUserDocumentUseCase(
      employeeProfileRepository as unknown as EmployeeProfileRepositoryPort,
      documentStorage as DocumentStoragePort,
    );

    await expect(useCase.execute('user-1', 'doc-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});
