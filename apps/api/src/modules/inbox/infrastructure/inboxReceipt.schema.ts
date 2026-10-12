import { Schema, model, type Types } from 'mongoose';
import { INBOX_KINDS, type InboxKind } from '../domain/inboxMessage.entity.js';

export interface InboxReceiptDoc {
  messageId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  body: string;
  kind: InboxKind;
  sentAt: Date;
  expiresAt: Date | null;
  readAt: Date | null;
}

const inboxReceiptSchema = new Schema<InboxReceiptDoc>({
  messageId: { type: Schema.Types.ObjectId, required: true, ref: 'InboxMessage' },
  userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  title: { type: String, required: true },
  body: { type: String, required: true },
  kind: { type: String, required: true, enum: INBOX_KINDS },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
});

// One copy per person per message; a person's inbox reads newest first.
inboxReceiptSchema.index({ messageId: 1, userId: 1 }, { unique: true });
inboxReceiptSchema.index({ userId: 1, sentAt: -1 });

export const InboxReceiptModel = model<InboxReceiptDoc>('InboxReceipt', inboxReceiptSchema);
