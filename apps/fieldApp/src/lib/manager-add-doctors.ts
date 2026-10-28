import type { ConfigSnapshot } from '@/types/sync';

/**
 * Whether this person may add a doctor (docs/mobile/doctors.md rule 1). A manager (anyone with a team) may only while Admin has
 * "Managers can add doctors" on (`MANAGER_CAN_ADD_DOCTORS`, default off). The server does not send the setting to the phone yet
 * (docs/mobile/field-app-gaps.md section C), so until `config.settings` carries it a manager is treated as not allowed, the
 * server's default. Once it is sent as `true`, the button shows by itself. A refusal that still gets through (the setting was
 * turned off after the phone read it) comes back as `403`, or `MANAGER_NOT_ALLOWED` on a queued add.
 */
export const MANAGER_NOT_ALLOWED = 'MANAGER_NOT_ALLOWED';

export const managerAddsOn = (config: ConfigSnapshot | null | undefined): boolean =>
  String(config?.settings.MANAGER_CAN_ADD_DOCTORS ?? '').toLowerCase() === 'true';

export const mayAddDoctor = (isManager: boolean, config: ConfigSnapshot | null | undefined): boolean => !isManager || managerAddsOn(config);
