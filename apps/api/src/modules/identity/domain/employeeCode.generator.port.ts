/** Hands out the next employee code (GHC001, GHC002 …), never the same one twice. */
export interface EmployeeCodeGeneratorPort {
  next(): Promise<string>;
}
