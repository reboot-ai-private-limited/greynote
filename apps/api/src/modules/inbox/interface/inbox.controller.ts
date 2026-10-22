import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { MyInboxUseCases } from '../application/usecases/myInbox.usecase.js';
import type { PublishMessageUseCase } from '../application/usecases/publishMessage.usecase.js';
import type { SentMessagesUseCases } from '../application/usecases/sentMessages.usecase.js';
import type { myInboxQuerySchema, publishBodySchema, sentQuerySchema } from './inbox.schemas.js';

const userId = (req: Request): string => {
  if (!req.user) throw AppError.unauthenticated();
  return req.user.sub;
};

export type InboxHandlers = Record<'list' | 'unreadCount' | 'markRead' | 'markAllRead' | 'publish' | 'listSent' | 'retract', RequestHandler>;

export function makeInboxControllers(u: { mine: MyInboxUseCases; publish: PublishMessageUseCase; sent: SentMessagesUseCases }): InboxHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof myInboxQuerySchema>;
      sendSuccess(req, res, await u.mine.list(userId(req), { unreadOnly: q.unread }, q), 'Your inbox.', 200);
    }),
    unreadCount: asyncHandler(async (req, res) => sendSuccess(req, res, { unread: await u.mine.unreadCount(userId(req)) }, 'Unread messages.', 200)),
    markRead: asyncHandler(async (req, res) => {
      await u.mine.markRead(userId(req), requiredParam(req.params, 'id'));
      sendSuccess(req, res, null, 'Marked as read.', 200);
    }),
    markAllRead: asyncHandler(async (req, res) => sendSuccess(req, res, { marked: await u.mine.markAllRead(userId(req)) }, 'All marked as read.', 200)),
    publish: asyncHandler(async (req, res) => {
      const files = ((req.files as Array<{ buffer: Buffer; originalname: string }> | undefined) ?? []).map((f) => ({ buffer: f.buffer, name: f.originalname }));
      const message = await u.publish.execute({ ...(req.body as z.output<typeof publishBodySchema>), files }, userId(req));
      sendSuccess(req, res, { id: message.id, recipientCount: message.recipientCount }, 'Message sent.', 201);
    }),
    listSent: asyncHandler(async (req, res) => sendSuccess(req, res, await u.sent.list(req.query as unknown as z.output<typeof sentQuerySchema>), 'Sent messages.', 200)),
    retract: asyncHandler(async (req, res) => {
      await u.sent.retract(requiredParam(req.params, 'id'));
      sendSuccess(req, res, null, 'Message taken back.', 200);
    }),
  };
}
