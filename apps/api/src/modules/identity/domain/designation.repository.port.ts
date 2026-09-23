import type { Designation, DesignationName } from './designation.entity.js';

export interface DesignationRepositoryPort {
  findById(id: string): Promise<Designation | null>;
  findByName(name: DesignationName): Promise<Designation | null>;
  list(): Promise<Designation[]>;
  create(input: Omit<Designation, 'id'>): Promise<Designation>;
  update(id: string, input: Partial<Omit<Designation, 'id'>>): Promise<Designation>;
}
