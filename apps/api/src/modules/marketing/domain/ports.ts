import type { RoleName } from '@greynote/contracts';

/** Marketing's narrow views of the modules below it; their public contracts satisfy these structurally. */
export interface ProductPort {
  getProduct(id: string): Promise<{ id: string; name?: string; status: 'active' | 'inactive'; ptsPaise: number | null } | null>;
}

/** The Doctor side of Field Master Data: who may act on a Doctor and which MR it is with. */
export interface DoctorPort {
  getDoctor(doctorId: string): Promise<{ id: string } | null>;
  isAssignedToDoctor(userId: string, doctorId: string): Promise<boolean>;
  getAssignedUserId(doctorId: string): Promise<string | null>;
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
  /** Designation level (MR 1 … NSM 5) of each user; users without one are left out. */
  getDesignationLevels(userIds: string[]): Promise<Array<{ userId: string; level: number }>>;
}

export interface SalesPort {
  sumOrderAmount(filter: { userIds: string[]; from: string; to: string; productId?: string | undefined }): Promise<number>;
}
