import type { RoleName } from '@greynote/contracts';

export interface Recipient {
  id: string;
  role: RoleName;
  hqId: string | null;
  zoneId: string | null;
}

/** Inbox's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface RecipientDirectoryPort {
  listActiveRecipients(): Promise<Recipient[]>;
}

/** Inbox's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface TerritoryPort {
  getHq(hqId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
  getZone(zoneId: string): Promise<{ id: string; status: 'active' | 'inactive' } | null>;
}
