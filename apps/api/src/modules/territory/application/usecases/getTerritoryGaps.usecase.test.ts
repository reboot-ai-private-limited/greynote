import { describe, expect, it } from 'vitest';
import { GetTerritoryGapsUseCase } from './getTerritoryGaps.usecase.js';

describe('team gaps (2026-11-26)', () => {
  it('a manager is based in one HQ and plans the team through the team, so there is never a gap', async () => {
    expect(await new GetTerritoryGapsUseCase().all()).toEqual([]);
    expect(await new GetTerritoryGapsUseCase().forManager('rsm')).toBeNull();
  });
});
