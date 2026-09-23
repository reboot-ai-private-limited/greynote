import { describe, expect, it } from 'vitest';
import type { DocumentStoragePort } from '../../domain/documentStorage.port.js';
import type { User, UserDocument } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { RemoveUserDocumentUseCase } from './removeUserDocument.usecase.js';

const DOCUMENT: UserDocument = {
  id: 'doc-1',
  type: 'AADHAAR',
  url: 'https://cloudinary.example/doc-1.pdf',
  publicId: 'greynote/users/user-1/documents/doc-1',
  uploadedAt: new Date(),
};

function makeUser(documents: UserDocument[]): User {
  return {
    id: 'user-1',
    employeeCode: 'MR001',
    name: 'Jane MR',
    email: null,
    phone: null,
    mobileNumber: null,
    guardianName: null,
    dateOfBirth: null,
    address: null,
    qualification: null,
    bankDetails: null,
    documents,
    status: 'pending',
    roleId: 'role-field',
    designationId: null,
    payBandId: null,
    managerId: null,
    passwordHash: 'x',
    dateOfJoining: new Date('2024-01-01'),
    lastLoginAt: null,
    isBlocked: false,
    blockedReason: null,
    blockedAt: null,
    unblockedBy: null,
    unblockedAt: null,
  };
}

class FakeUserRepository implements Pick<UserRepositoryPort, 'findById' | 'update'> {
  updates: Array<{ id: string; input: Partial<User> }> = [];
  constructor(private user: User | null) {}
  async findById(): Promise<User | null> {
    return this.user;
  }
  async update(id: string, input: Partial<User>): Promise<User> {
    this.updates.push({ id, input });
    this.user = { ...(this.user as User), ...input };
    return this.user;
  }
}

describe('RemoveUserDocumentUseCase', () => {
  it('removes from storage before touching the DB record, then clears the document from the array', async () => {
    const calls: string[] = [];
    const userRepository = new FakeUserRepository(makeUser([DOCUMENT]));
    const originalUpdate = userRepository.update.bind(userRepository);
    userRepository.update = async (id, input) => {
      calls.push('db.update');
      return originalUpdate(id, input);
    };
    const documentStorage: Pick<DocumentStoragePort, 'remove'> = {
      remove: async () => {
        calls.push('storage.remove');
      },
    };
    const useCase = new RemoveUserDocumentUseCase(
      userRepository as unknown as UserRepositoryPort,
      documentStorage as DocumentStoragePort,
    );

    await useCase.execute('user-1', 'doc-1');

    expect(calls).toEqual(['storage.remove', 'db.update']);
    expect(userRepository.updates[0]?.input.documents).toEqual([]);
  });

  it('does not touch the DB record when storage removal fails', async () => {
    const userRepository = new FakeUserRepository(makeUser([DOCUMENT]));
    const documentStorage: Pick<DocumentStoragePort, 'remove'> = {
      remove: async () => {
        throw new Error('Cloudinary is down');
      },
    };
    const useCase = new RemoveUserDocumentUseCase(
      userRepository as unknown as UserRepositoryPort,
      documentStorage as DocumentStoragePort,
    );

    await expect(useCase.execute('user-1', 'doc-1')).rejects.toThrow('Cloudinary is down');
    expect(userRepository.updates).toHaveLength(0);
  });

  it('404s when the document id does not exist on the user', async () => {
    const userRepository = new FakeUserRepository(makeUser([]));
    const documentStorage: Pick<DocumentStoragePort, 'remove'> = { remove: async () => {} };
    const useCase = new RemoveUserDocumentUseCase(
      userRepository as unknown as UserRepositoryPort,
      documentStorage as DocumentStoragePort,
    );

    await expect(useCase.execute('user-1', 'missing-doc')).rejects.toMatchObject({ statusCode: 404 });
  });
});
