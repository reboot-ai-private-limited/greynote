/** Hands out the next employee code (GRN0001, GRN0002 …), never the same one twice. */
export interface EmployeeCodeGeneratorPort {
  next(): Promise<string>;
}
