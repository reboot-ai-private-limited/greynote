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

/** What the phone gets alongside the title and body: `type` names the kind of event, `route` the screen a tap opens. */
export type PushData = Record<string, string>;

/** Inbox's narrow view of the push sender (a nudge to the phone); the composition root supplies it. */
export interface PushPort {
  pushTo(userIds: string[], message: { title: string; body: string; data?: PushData }): Promise<void>;
}
