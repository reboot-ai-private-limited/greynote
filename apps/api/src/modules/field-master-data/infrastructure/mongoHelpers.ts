export const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;
export const toSkuKey = (sku: string): string => sku.trim().toLowerCase();
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
