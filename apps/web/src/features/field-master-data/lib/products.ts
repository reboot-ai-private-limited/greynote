import { GST_RATES, PRODUCT_TYPES, type CreateProductDto, type GstRate, type ProductDto, type ProductType, type UpdateProductDto } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

export const NAME_MAX = 150;
export const SKU_MAX = 60;
export const CATEGORY_MAX = 100;
export const COMPOSITION_MAX = 300;
export const PACK_MAX = 40;
export const DIVISION_MAX = 100;

/** Money is typed in rupees (`90`, `90.50`); the type and GST are chosen from their lists ('' = not chosen yet). */
export interface ProductDraft {
  name: string;
  sku: string;
  /** The therapeutic class. */
  category: string;
  composition: string;
  type: string;
  packSize: string;
  pts: string;
  ptr: string;
  mrp: string;
  gst: string;
  division: string;
}

export const EMPTY_PRODUCT: ProductDraft = { name: '', sku: '', category: '', composition: '', type: '', packSize: '', pts: '', ptr: '', mrp: '', gst: '', division: '' };

export function productToDraft(product: ProductDto): ProductDraft {
  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    composition: product.composition ?? '',
    type: product.type ?? '',
    packSize: product.packSize ?? '',
    pts: product.ptsPaise === null ? '' : paiseToRupees(product.ptsPaise),
    ptr: product.ptrPaise === null ? '' : paiseToRupees(product.ptrPaise),
    mrp: product.mrpPaise === null ? '' : paiseToRupees(product.mrpPaise),
    gst: product.gstPercent === null ? '' : String(product.gstPercent),
    division: product.division ?? '',
  };
}

const isType = (v: string): v is ProductType => (PRODUCT_TYPES as readonly string[]).includes(v);
const isGst = (v: string): boolean => (GST_RATES as readonly number[]).includes(Number(v)) && v !== '';

/** A price typed in rupees, or why not. Empty is `null` here; whether that is allowed is the caller's rule. */
function price(raw: string): { paise: number | null; error?: string } {
  const text = raw.trim();
  if (text === '') return { paise: null };
  const paise = rupeesToPaise(text);
  if (paise === null) return { paise: null, error: 'Enter an amount in rupees, like 90 or 90.50.' };
  if (paise === 0) return { paise: null, error: 'Must be more than 0.' };
  return { paise };
}

/**
 * The checks. `required` says the new fields must be filled (a new product, or an edit of one that already has them); an older product
 * being edited may leave them empty until someone completes it, but whatever is typed is still checked.
 */
function problems(draft: ProductDraft, required: boolean) {
  const name = squash(draft.name);
  const sku = draft.sku.trim();
  const category = squash(draft.category);
  const composition = squash(draft.composition);
  const packSize = squash(draft.packSize);
  const division = squash(draft.division);
  const pts = price(draft.pts);
  const ptr = price(draft.ptr);
  const mrp = price(draft.mrp);
  const needed = (value: string, message: string) => (required && value === '' ? message : undefined);

  const ladder =
    pts.paise !== null && ptr.paise !== null && pts.paise > ptr.paise
      ? { pts: 'PTS cannot be more than PTR.' }
      : ptr.paise !== null && mrp.paise !== null && ptr.paise > mrp.paise
        ? { ptr: 'PTR cannot be more than MRP.' }
        : pts.paise !== null && mrp.paise !== null && pts.paise > mrp.paise
          ? { pts: 'PTS cannot be more than MRP.' }
          : {};

  return {
    clean: { name, sku, category, composition, packSize, division, ptsPaise: pts.paise, ptrPaise: ptr.paise, mrpPaise: mrp.paise },
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
        category === ''
          ? 'Enter the therapeutic class.'
          : category.length > CATEGORY_MAX
            ? `Keep the class to ${CATEGORY_MAX} characters.`
            : undefined,
      composition: needed(composition, 'Enter the composition.') ?? (composition.length > COMPOSITION_MAX ? `Keep the composition to ${COMPOSITION_MAX} characters.` : undefined),
      type: draft.type === '' ? needed('', 'Choose the type.') : isType(draft.type) ? undefined : 'Choose the type from the list.',
      packSize: needed(packSize, 'Enter the pack size, like 10×10.') ?? (packSize.length > PACK_MAX ? `Keep the pack size to ${PACK_MAX} characters.` : undefined),
      pts: pts.error ?? needed(draft.pts.trim(), 'Enter the PTS.') ?? ladder.pts,
      ptr: ptr.error ?? needed(draft.ptr.trim(), 'Enter the PTR.') ?? ladder.ptr,
      mrp: mrp.error ?? needed(draft.mrp.trim(), 'Enter the MRP.'),
      gst: draft.gst === '' ? needed('', 'Choose the GST.') : isGst(draft.gst) ? undefined : 'Choose the GST from the list.',
      division: division.length > DIVISION_MAX ? `Keep the division to ${DIVISION_MAX} characters.` : undefined,
    },
  };
}

export function buildProduct(draft: ProductDraft): BuildResult<CreateProductDto> {
  const { clean, errors } = problems(draft, true);
  if (Object.values(errors).some(Boolean)) return fail(errors);
  const { division, ptsPaise, ptrPaise, mrpPaise, ...rest } = clean;
  return {
    ok: true,
    body: {
      ...rest,
      type: draft.type as ProductType,
      gstPercent: Number(draft.gst) as GstRate,
      ptsPaise: ptsPaise as number,
      ptrPaise: ptrPaise as number,
      mrpPaise: mrpPaise as number,
      ...(division !== '' && { division }),
    },
  };
}

/** Only what changed; `{}` means nothing did and the form can just close. */
export function buildProductUpdate(original: ProductDto, draft: ProductDraft): BuildResult<UpdateProductDto> {
  // A product that already has the new details must keep them; an older one may stay as it is until someone completes it.
  const { clean, errors } = problems(draft, original.type !== null);
  if (Object.values(errors).some(Boolean)) return fail(errors);
  const before = productToDraft(original);
  const changed = (a: string, b: string) => a.trim() !== b.trim();
  return {
    ok: true,
    body: {
      ...(clean.name !== original.name && { name: clean.name }),
      ...(clean.sku !== original.sku && { sku: clean.sku }),
      ...(clean.category !== original.category && { category: clean.category }),
      ...(clean.composition !== '' && clean.composition !== (original.composition ?? '') && { composition: clean.composition }),
      ...(isType(draft.type) && draft.type !== original.type && { type: draft.type }),
      ...(clean.packSize !== '' && clean.packSize !== (original.packSize ?? '') && { packSize: clean.packSize }),
      ...(clean.ptsPaise !== null && clean.ptsPaise !== original.ptsPaise && { ptsPaise: clean.ptsPaise }),
      ...(clean.ptrPaise !== null && clean.ptrPaise !== original.ptrPaise && { ptrPaise: clean.ptrPaise }),
      ...(clean.mrpPaise !== null && clean.mrpPaise !== original.mrpPaise && { mrpPaise: clean.mrpPaise }),
      ...(isGst(draft.gst) && Number(draft.gst) !== original.gstPercent && { gstPercent: Number(draft.gst) as GstRate }),
      ...(changed(draft.division, before.division) && { division: clean.division === '' ? null : clean.division }),
    },
  };
}

/** The distinct therapeutic classes in use, sorted: the filter's options and the form's suggestions. */
export function distinctCategories(products: readonly Pick<ProductDto, 'category'>[]): string[] {
  return [...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b));
}
