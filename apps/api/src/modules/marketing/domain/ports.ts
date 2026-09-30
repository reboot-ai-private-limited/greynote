import type { RoleName } from '@greynote/contracts';

/** Marketing's narrow views of the modules below it; their public contracts satisfy these structurally. */
export interface ProductPort {
  getProduct(id: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
}

export interface DirectoryUser {
  id: string;
  name: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<DirectoryUser | null>;
  /** Everyone below this manager, at any depth. */
  getDownline(managerId: string): Promise<DirectoryUser[]>;
}

export interface SalesPort {
  sumOrderAmount(filter: { userIds: string[]; from: string; to: string; productId?: string | undefined }): Promise<number>;
}
