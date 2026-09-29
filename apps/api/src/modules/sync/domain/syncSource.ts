/**
 * One named slice of the reference data the phone caches (LLD sync.md, Pull): Doctors, Routes, leave
 * balances… Registered once at boot by whichever module owns the data, the way handlers are.
 */
export interface SyncSourceDefinition {
  /** The key the phone stores its version under, e.g. `fieldMasterData`. camelCase, unique. */
  name: string;
  /**
   * Everything of this kind that **this user** may see, as plain data (no class instances; dates are
   * fine). It is the whole snapshot, not a change list — a delta can't see something appearing because
   * the user gained a Route. **Deterministic**: the same data must produce the same snapshot, so sort
   * lists by a stable key and leave out anything that changes on its own (a clock, a counter), or the
   * phone would be told "changed" on every pull.
   */
  snapshot(userId: string): Promise<unknown>;
}
