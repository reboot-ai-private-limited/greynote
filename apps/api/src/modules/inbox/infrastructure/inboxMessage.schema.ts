import { Schema, model, type Types } from 'mongoose';
import { INBOX_KINDS, type InboxKind } from '../domain/inboxMessage.entity.js';
import { ROLE_NAMES, type RoleName } from '@greynote/contracts';

export interface InboxMessageDoc {
  title: string;
  body: string;
  kind: InboxKind;
  audience: { everyone: boolean; roles: RoleName[]; zoneIds: Types.ObjectId[]; hqIds: Types.ObjectId[]; userIds: Types.ObjectId[] };
  recipientCount: number;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  expiresAt: Date | null;
  retractedAt: Date | null;
}

const inboxMessageSchema = new Schema<InboxMessageDoc>({
  title: { type: String, required: true },
  body: { type: String, required: true },
  kind: { type: String, required: true, enum: INBOX_KINDS },
  audience: {
    everyone: { type: Boolean, required: true, default: false },
    roles: { type: [String], enum: ROLE_NAMES, default: [] },
    zoneIds: { type: [Schema.Types.ObjectId], default: [] },
    hqIds: { type: [Schema.Types.ObjectId], default: [] },
    userIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  recipientCount: { type: Number, required: true },
  createdBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, default: null },
  retractedAt: { type: Date, default: null },
});

inboxMessageSchema.index({ createdAt: -1 });

export const InboxMessageModel = model<InboxMessageDoc>('InboxMessage', inboxMessageSchema);
