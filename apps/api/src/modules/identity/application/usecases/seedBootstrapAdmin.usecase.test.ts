import { describe, expect, it } from 'vitest';
import type { PasswordHasherPort } from '../../domain/passwordHasher.port.js';
import type { Role } from '../../domain/role.entity.js';
import type { RoleRepositoryPort } from '../../domain/role.repository.port.js';
import type { User } from '../../domain/user.entity.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';
import { SeedBootstrapAdminUseCase } from './seedBootstrapAdmin.usecase.js';

const ADMIN_ROLE: Role = { id: 'role-admin', name: 'ADMIN' };
const INPUT = {
  employeeCode: 'EMP01',
  name: 'Jane Admin',
  email: 'jane@example.com',
  phone: '9999999999',
  password: 'correct-password',
};

class FakeUserRepository implements Pick<UserRepositoryPort, 'existsAdmin' | 'create'> {
  created: Array<Omit<User, 'id'>> = [];
  constructor(private hasAdmin: boolean) {}
  async existsAdmin(): Promise<boolean> {
    return this.hasAdmin;
  }
  async create(input: Omit<User, 'id'>): Promise<User> {
    this.created.push(input);
    return { ...input, id: 'user-new' };
  }
}

class FakeRoleRepository implements Pick<RoleRepositoryPort, 'findByName'> {
  constructor(private role: Role | null) {}
  async findByName(): Promise<Role | null> {
    return this.role;
  }
}

const passwordHasher: PasswordHasherPort = {
  hash: async (p) => `hashed:${p}`,
  verify: async () => true,
};

describe('SeedBootstrapAdminUseCase', () => {
  it('creates the first Admin, active immediately, when none exists', async () => {
    const userRepository = new FakeUserRepository(false);
    const useCase = new SeedBootstrapAdminUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(ADMIN_ROLE) as unknown as RoleRepositoryPort,
      passwordHasher,
    );

    await useCase.execute(INPUT);

    expect(userRepository.created).toHaveLength(1);
    expect(userRepository.created[0]).toMatchObject({
      employeeCode: 'EMP01',
      roleId: ADMIN_ROLE.id,
      status: 'active',
      passwordHash: 'hashed:correct-password',
    });
  });

  it('is a no-op if an ADMIN user already exists — never creates a second one', async () => {
    const userRepository = new FakeUserRepository(true);
    const useCase = new SeedBootstrapAdminUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(ADMIN_ROLE) as unknown as RoleRepositoryPort,
      passwordHasher,
    );

    await useCase.execute(INPUT);

    expect(userRepository.created).toHaveLength(0);
  });

  it('throws if the ADMIN role has not been seeded yet (seed.ts skipped a step)', async () => {
    const userRepository = new FakeUserRepository(false);
    const useCase = new SeedBootstrapAdminUseCase(
      userRepository as unknown as UserRepositoryPort,
      new FakeRoleRepository(null) as unknown as RoleRepositoryPort,
      passwordHasher,
    );

    await expect(useCase.execute(INPUT)).rejects.toMatchObject({ statusCode: 500 });
    expect(userRepository.created).toHaveLength(0);
  });
});
