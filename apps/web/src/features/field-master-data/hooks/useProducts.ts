'use client';

import type { CreateProductDto, UpdateProductDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { productsApi, type ListProductsQuery } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { distinctCategories } from '../lib/products';

export function useProducts(query?: ListProductsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.products.list(query),
      fetch: (token, signal) => productsApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/** The categories in use, from one page of 100 (the API's cap): a catalog is tens of products, not thousands. */
export function useProductCategories() {
  const products = useProducts({ page: 1, pageSize: 100 });
  return { categories: distinctCategories(products.data?.items ?? []), isLoading: products.isLoading };
}

export function useCreateProduct(onDone: () => void) {
  return useApiMutation<CreateProductDto>({
    call: (token, body) => productsApi.create(token, body),
    invalidates: [keys.products.all()],
    successMessage: 'Product created.',
    onSuccess: onDone,
  });
}

export function useUpdateProduct(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateProductDto }>({
    call: (token, { id, body }) => productsApi.update(token, id, body),
    invalidates: [keys.products.all()],
    successMessage: 'Product updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

/** Every active product, for a picker: a page of 100 would silently drop the rest of a larger catalog. */
export function useActiveProducts() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.products.directory(),
      fetch: (token, signal) =>
        fetchAllPages((page) => productsApi.list(token, { page, pageSize: MAX_PAGE_SIZE, status: 'active' }, signal)).then((r) => r.items),
      staleTime: staleTime.configuration,
    }),
  );
}
