import type { Router } from 'express';
import { MyInboxUseCases } from './application/usecases/myInbox.usecase.js';
import { PublishMessageUseCase } from './application/usecases/publishMessage.usecase.js';
import { SentMessagesUseCases } from './application/usecases/sentMessages.usecase.js';
import type { PushPort, RecipientDirectoryPort, TerritoryPort } from './domain/ports.js';
import { CloudinaryAttachmentStorage } from './infrastructure/cloudinaryAttachmentStorage.adapter.js';
import { MongoInboxMessageAdapter, MongoInboxReceiptAdapter } from './infrastructure/mongoInbox.adapter.js';
import { makeInboxControllers } from './interface/inbox.controller.js';
import { buildInboxRouter } from './interface/inbox.route.js';
import type { InboxPublicContract } from './inbox.public.js';

export interface InboxContainer {
  contract: InboxPublicContract;
  buildRouter: () => Router;
}

/** Identity's and Territory's public contracts, passed in by the composition root. */
export function buildInboxContainer(directory: RecipientDirectoryPort, territory: TerritoryPort, push: PushPort | null = null): InboxContainer {
  const messages = new MongoInboxMessageAdapter();
  const receipts = new MongoInboxReceiptAdapter();
  // Cloudinary is configured on first upload, so a server without its keys still sends text-only messages.
  const storage = new CloudinaryAttachmentStorage();
  const publish = new PublishMessageUseCase(messages, receipts, directory, territory, storage, push);
  const mine = new MyInboxUseCases(receipts);
  const sent = new SentMessagesUseCases(messages, receipts, undefined, storage);

  return {
    contract: {
      notify: async (userIds, input) => {
        const message = await publish.execute(
          { ...input, audience: { everyone: false, roles: [], zoneIds: [], hqIds: [], userIds } },
          null,
        );
        return message.recipientCount;
      },
    },
    buildRouter: () => buildInboxRouter(makeInboxControllers({ mine, publish, sent })),
  };
}
