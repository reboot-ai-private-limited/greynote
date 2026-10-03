import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';

interface HierarchyUseCases<ListQuery, CreateInput, UpdateInput> {
  list: { execute(query: ListQuery): Promise<unknown> };
  create: { execute(input: CreateInput): Promise<unknown> };
  update: { execute(id: string, input: UpdateInput): Promise<unknown> };
}

/**
 * One factory for Zone/HQ/Route — the same list/create/update shape at every level, like
 * identity's `makeMasterDataController`. `validate()` has already parsed body and query, so
 * each is passed through as its schema's output type.
 */
export function makeHierarchyController<ListQuery, CreateInput, UpdateInput>(
  useCases: HierarchyUseCases<ListQuery, CreateInput, UpdateInput>,
  noun: string,
): { list: RequestHandler; create: RequestHandler; update: RequestHandler } {
  return {
    list: asyncHandler(async (req, res) => {
      const result = await useCases.list.execute(req.query as unknown as ListQuery);
      sendSuccess(req, res, result, `${noun}s listed.`, 200);
    }),
    create: asyncHandler(async (req, res) => {
      const item = await useCases.create.execute(req.body);
      sendSuccess(req, res, item, `${noun} created.`, 201);
    }),
    update: asyncHandler(async (req, res) => {
      const item = await useCases.update.execute(requiredParam(req.params, 'id'), req.body);
      sendSuccess(req, res, item, `${noun} updated.`, 200);
    }),
  };
}
