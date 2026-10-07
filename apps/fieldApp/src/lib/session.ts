import { useSyncExternalStore } from 'react';

import type { LoginResponse, SessionUser } from '@/types/auth';

import { storage } from './storage';

type Tokens = { accessToken: string; refreshToken: string };

/** In-memory session, mirrored to secure storage so a restart can restore it (see restoreSession). */
let user: SessionUser | null = null;
let tokens: Tokens | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());


export async function setSession(data: LoginResponse): Promise<void> {
  user = data.user;
  tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
  await Promise.all([
    storage.set('accessToken', data.accessToken),
    storage.set('refreshToken', data.refreshToken),
    storage.set('user', JSON.stringify(data.user)),
  ]);
  emit();
}

/** Stores a rotated token pair (refresh rotates the refresh token — the old one stops working). */
export async function setTokens(next: Tokens): Promise<void> {
  tokens = next;
  await Promise.all([
    storage.set('accessToken', next.accessToken),
    storage.set('refreshToken', next.refreshToken),
  ]);
}

export async function setUser(next: SessionUser): Promise<void> {
  user = next;
  await storage.set('user', JSON.stringify(next));
  emit();
}

export async function clearSession(): Promise<void> {
  user = null;
  tokens = null;
  await Promise.all(['accessToken', 'refreshToken', 'user'].map((k) => storage.remove(k)));
  emit();
}

/** Loads a saved session from secure storage. Returns whether one exists (not whether it's still valid). */
export async function restoreSession(): Promise<boolean> {
  const [accessToken, refreshToken, rawUser] = await Promise.all([
    storage.get('accessToken'),
    storage.get('refreshToken'),
    storage.get('user'),
  ]);
  if (!accessToken || !refreshToken || !rawUser) return false;
  try {
    user = JSON.parse(rawUser) as SessionUser;
  } catch {
    return false;
  }
  tokens = { accessToken, refreshToken };
  emit();
  return true;
}

export const getTokens = () => tokens;

export function useSessionUser(): SessionUser | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => user,
  );
}
