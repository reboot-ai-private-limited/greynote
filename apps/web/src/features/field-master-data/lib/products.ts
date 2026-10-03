import type { CreateProductDto, ProductDto, UpdateProductDto } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';

export const NAME_MAX = 150;
export const SKU_MAX = 60;
export const CATEGORY_MAX = 100;

export interface ProductDraft {
  name: string;
  sku: string;
  category: string;
}

export const EMPTY_PRODUCT: ProductDraft = { name: '', sku: '', category: '' };

export function productToDraft(product: ProductDto): ProductDraft {
  return { name: product.name, sku: product.sku, category: product.category };
}

function problems(draft: ProductDraft) {
  const name = squash(draft.name);
  const sku = draft.sku.trim();
  const category = squash(draft.category);
  return {
    clean: { name, sku, category },
    errors: {
      name: name === '' ? 'Enter a name.' : name.length > NAME_MAX ? `Keep the name to ${NAME_MAX} characters.` : undefined,
      sku:
        sku === ''
          ? 'Enter a SKU.'
          : /\s/.test(sku)
            ? 'A SKU has no spaces.'
            : sku.length > SKU_MAX
              ? `Keep the SKU to ${SKU_MAX} characters.`
              : undefined,
      category:
        category === '' ? 'Enter a category.' : category.length > CATEGORY_MAX ? `Keep the category to ${CATEGORY_MAX} characters.` : undefined,
    },
  };
}

export function buildProduct(draft: ProductDraft): BuildResult<CreateProductDto> {
  const { clean, errors } = problems(draft);
  return Object.values(errors).some(Boolean) ? fail(errors) : { ok: true, body: clean };
}

/** Only what changed; `{}` means nothing did and the form can just close. */
export function buildProductUpdate(original: ProductDto, draft: ProductDraft): BuildResult<UpdateProductDto> {
  const { clean, errors } = problems(draft);
  if (Object.values(errors).some(Boolean)) return fail(errors);
  return {
    ok: true,
    body: {
      ...(clean.name !== original.name && { name: clean.name }),
      ...(clean.sku !== original.sku && { sku: clean.sku }),
      ...(clean.category !== original.category && { category: clean.category }),
    },
  };
}

/** The distinct categories in use, sorted: the filter's options and the form's suggestions. */
export function distinctCategories(products: readonly Pick<ProductDto, 'category'>[]): string[] {
  return [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b));
}
