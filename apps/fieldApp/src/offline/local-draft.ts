import { store } from './store';

/**
 * A form kept on the phone only — for screens whose Save and Submit need a connection (the Plans),
 * so an MR can compose offline and send later. Not part of the outbox or the server's draft backup:
 * those carry records the server accepts offline; these are just unsent form contents.
 */
const key = (name: string) => `form:${name}`;

export async function loadLocalDraft<T>(name: string): Promise<T | null> {
  const raw = await store.getMeta(key(name));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const saveLocalDraft = (name: string, value: unknown) => store.setMeta(key(name), JSON.stringify(value));

export const clearLocalDraft = (name: string) => store.setMeta(key(name), '');
