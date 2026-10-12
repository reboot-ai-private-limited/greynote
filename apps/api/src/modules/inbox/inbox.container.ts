import type { Router } from 'express';
import { MyInboxUseCases } from './application/usecases/myInbox.usecase.js';
import { PublishMessageUseCase } from './application/usecases/publishMessage.usecase.js';
import { SentMessagesUseCases } from './application/usecases/sentMessages.usecase.js';
import type { RecipientDirectoryPort, TerritoryPort } from './domain/ports.js';
import { MongoInboxMessageAdapter, MongoInboxReceiptAdapter } from './infrastructure/mongoInbox.adapter.js';
import { makeInboxControllers } from './interface/inbox.controller.js';
import { buildInboxRouter } from './interface/inbox.route.js';
import type { InboxPublicContract } from './inbox.public.js';

export interface InboxContainer {
  contract: InboxPublicContract;
  buildRouter: () => Router;
}

/** Identity's and Territory's public contracts, passed in by the composition root. */
export function buildInboxContainer(directory: RecipientDirectoryPort, territory: TerritoryPort): InboxContainer {
  const messages = new MongoInboxMessageAdapter();
  const receipts = new MongoInboxReceiptAdapter();
  const publish = new PublishMessageUseCase(messages, receipts, directory, territory);
  const mine = new MyInboxUseCases(receipts);
  const sent = new SentMessagesUseCases(messages, receipts);

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
