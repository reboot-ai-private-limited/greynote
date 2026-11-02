import type { PublicFlags } from './public-config';

/**
 * Whether this person may add a doctor (docs/mobile/doctors.md rule 1). A manager (anyone with a team) may only while Admin has
 * "Managers can add doctors" on (default off). The phone reads the setting from `GET /config/public` (`managerCanAddDoctors`,
 * see `usePublicFlags`); until it has been read a manager is treated as not allowed, the server's default. A refusal that still
 * gets through (the setting was turned off after the phone read it) comes back as `403`, or `MANAGER_NOT_ALLOWED` on a queued add.
 */
export const MANAGER_NOT_ALLOWED = 'MANAGER_NOT_ALLOWED';

export const mayAddDoctor = (isManager: boolean, flags: PublicFlags): boolean => !isManager || flags.managerCanAddDoctors;

/** The same for a chemist (docs/mobile/chemists.md rule 1): `managerCanAddChemists`, a separate setting. */
export const mayAddChemist = (isManager: boolean, flags: PublicFlags): boolean => !isManager || flags.managerCanAddChemists;
