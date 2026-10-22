import { Schema, model, type Types } from 'mongoose';
import { INBOX_ATTACHMENT_KINDS, type InboxAttachment } from '../domain/attachment.js';
import { INBOX_KINDS, type InboxKind } from '../domain/inboxMessage.entity.js';
import { ROLE_NAMES, type RoleName } from '@greynote/contracts';

export interface InboxMessageDoc {
  title: string;
  body: string;
  kind: InboxKind;
  audience: { everyone: boolean; roles: RoleName[]; zoneIds: Types.ObjectId[]; hqIds: Types.ObjectId[]; userIds: Types.ObjectId[] };
  attachments: InboxAttachment[];
  recipientCount: number;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  expiresAt: Date | null;
  retractedAt: Date | null;
}

/** Shared with the receipts, which keep everything but where the file is stored. */
export const attachmentFields = {
  id: { type: String, required: true },
  name: { type: String, required: true },
  kind: { type: String, required: true, enum: INBOX_ATTACHMENT_KINDS },
  sizeBytes: { type: Number, required: true },
  url: { type: String, required: true },
};

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
  // Messages from before attachments have none.
  attachments: {
    type: [new Schema({ ...attachmentFields, publicId: { type: String, required: true }, resourceType: { type: String, required: true, enum: ['image', 'raw'] } }, { _id: false })],
    default: [],
  },
  recipientCount: { type: Number, required: true },
  createdBy: { type: Schema.Types.ObjectId, default: null, ref: 'User' },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, default: null },
  retractedAt: { type: Date, default: null },
});

inboxMessageSchema.index({ createdAt: -1 });

export const InboxMessageModel = model<InboxMessageDoc>('InboxMessage', inboxMessageSchema);
