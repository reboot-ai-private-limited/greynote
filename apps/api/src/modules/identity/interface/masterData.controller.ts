import type { RequestHandler } from 'express';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';

interface MasterDataUseCases<T, CreateInput, UpdateInput> {
  list: { execute(): Promise<T[]> };
  create: { execute(input: CreateInput): Promise<T> };
  update: { execute(id: string, input: UpdateInput): Promise<T> };
}

/**
 * One shared factory for Role/Designation/PayBand — identical CRUD shape (`GET/POST/PATCH`, no
 * delete, per the LLD), avoiding three near-duplicate controller files.
 */
export function makeMasterDataController<T, CreateInput, UpdateInput>(
  useCases: MasterDataUseCases<T, CreateInput, UpdateInput>,
  noun: string,
): { list: RequestHandler; create: RequestHandler; update: RequestHandler } {
  return {
    list: asyncHandler(async (req, res) => {
      const items = await useCases.list.execute();
      sendSuccess(req, res, items, `${noun}s listed.`, 200);
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

/** For a master with nothing to edit afterwards (Designations: the rank follows from the name). */
export function makeListCreateController<T, CreateInput>(
  useCases: Pick<MasterDataUseCases<T, CreateInput, never>, 'list' | 'create'>,
  noun: string,
): { list: RequestHandler; create: RequestHandler } {
  return {
    list: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.list.execute(), `${noun}s listed.`, 200);
    }),
    create: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await useCases.create.execute(req.body), `${noun} created.`, 201);
    }),
  };
}
