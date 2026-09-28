export const toNameKey = (name: string): string => name.trim().toLowerCase();
export const isDuplicateKey = (err: unknown): boolean => (err as { code?: number }).code === 11000;
