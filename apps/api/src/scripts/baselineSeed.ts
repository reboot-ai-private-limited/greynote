import { buildApprovalContainer } from '@/modules/approval/approval.container.js';
import { buildConfigContainer } from '@/modules/config/config.container.js';
import { buildHrContainer } from '@/modules/hr/hr.container.js';
import { buildIdentityContainer } from '@/modules/identity/identity.container.js';
import { buildSyncContainer } from '@/modules/sync/sync.container.js';
import { buildTerritoryContainer } from '@/modules/territory/territory.container.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * The steps every seed shares, all idempotent: SystemConfig defaults, the four roles, the default CTC pay components and
 * the starting leave types. Expects an open Mongo connection. Returns the identity container, which the callers use for
 * the first Admin.
 */
export async function seedBaseline() {
  const config = buildConfigContainer();
  await config.seed();
  logger.info('SystemConfig defaults seeded (existing Admin-edited values untouched)');

  const identity = buildIdentityContainer(config.contract);
  await identity.seedRoles();
  logger.info('Role rows seeded');
  await identity.seedPayComponents();
  logger.info('CTC pay components seeded (existing Admin-edited formula untouched)');

  const approval = buildApprovalContainer(identity.contract, config.contract);
  // HR registers its slice of the phone's cache with Sync as it builds; a seed run just needs somewhere to put it.
  const sync = buildSyncContainer(identity.contract, config.contract);
  const hr = buildHrContainer(identity.contract, buildTerritoryContainer(identity.contract, config.contract).contract, approval.contract, sync.contract, config.contract);
  await hr.seed();
  logger.info('Starting leave types seeded (existing ones untouched)');
  return identity;
}
