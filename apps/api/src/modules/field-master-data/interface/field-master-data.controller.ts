import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { CreateChemistUseCase } from '../application/usecases/createChemist.usecase.js';
import type { CreateProductUseCase } from '../application/usecases/createProduct.usecase.js';
import type { GetChemistUseCase } from '../application/usecases/getChemist.usecase.js';
import type { GetProductUseCase } from '../application/usecases/getProduct.usecase.js';
import type { ListChemistsUseCase } from '../application/usecases/listChemists.usecase.js';
import type { ListProductsUseCase } from '../application/usecases/listProducts.usecase.js';
import type { UpdateChemistUseCase } from '../application/usecases/updateChemist.usecase.js';
import type { UpdateProductUseCase } from '../application/usecases/updateProduct.usecase.js';
import type { listChemistsQuerySchema, listProductsQuerySchema } from './field-master-data.schemas.js';

export type CrudHandlers = Record<'list' | 'create' | 'get' | 'update', RequestHandler>;

export function makeProductControllers(u: {
  list: ListProductsUseCase;
  create: CreateProductUseCase;
  get: GetProductUseCase;
  update: UpdateProductUseCase;
}): CrudHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listProductsQuerySchema>;
      sendSuccess(req, res, await u.list.execute(query), 'Products.', 200);
    }),
    create: asyncHandler(async (req, res) => sendSuccess(req, res, await u.create.execute(req.body), 'Product created.', 201)),
    get: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(requiredParam(req.params, 'id')), 'Product.', 200)),
    update: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.update.execute(requiredParam(req.params, 'id'), req.body), 'Product updated.', 200),
    ),
  };
}

export function makeChemistControllers(u: {
  list: ListChemistsUseCase;
  create: CreateChemistUseCase;
  get: GetChemistUseCase;
  update: UpdateChemistUseCase;
}): CrudHandlers {
  return {
    list: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.output<typeof listChemistsQuerySchema>;
      sendSuccess(req, res, await u.list.execute(query), 'Chemists.', 200);
    }),
    create: asyncHandler(async (req, res) => sendSuccess(req, res, await u.create.execute(req.body), 'Chemist created.', 201)),
    get: asyncHandler(async (req, res) => sendSuccess(req, res, await u.get.execute(requiredParam(req.params, 'id')), 'Chemist.', 200)),
    update: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.update.execute(requiredParam(req.params, 'id'), req.body), 'Chemist updated.', 200),
    ),
  };
}
