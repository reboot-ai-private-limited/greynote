import { AppError } from '@/shared/errors/AppError.js';

export const skuTaken = (): AppError => AppError.conflict('A product with this SKU already exists.', { field: 'sku' });
