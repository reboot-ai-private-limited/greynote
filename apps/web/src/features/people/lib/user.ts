import type { CreateUserDto, UserListItemDto, UserListStatus } from '@greynote/contracts';
import { fail, type BuildResult } from '@/lib/forms';

export type UserRole = UserListItemDto['role'];

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Admin',
  HR: 'HR',
  ACCOUNTANT: 'Accountant',
  FIELD: 'Field force',
};

export const STATUS_LABEL: Record<UserListStatus, string> = {
  active: 'Active',
  pending: 'Onboarding',
  inactive: 'Inactive',
};

export const STATUS_TONE: Record<UserListStatus, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  pending: 'warning',
  inactive: 'neutral',
};

/** Who may create which role (PRD §5.3): Admin any, HR only the field force. Mirrors the API, which enforces it. */
export function creatableRoles(acting: string | undefined): UserRole[] {
  if (acting === 'ADMIN') return ['FIELD', 'HR', 'ACCOUNTANT', 'ADMIN'];
  if (acting === 'HR') return ['FIELD'];
  return [];
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;

export function passwordError(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  // bcrypt reads 72 bytes at most, so the API refuses longer ones rather than truncate.
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return `Use at most ${PASSWORD_MAX_BYTES} bytes.`;
  return undefined;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UserDraft {
  role: string;
  name: string;
  password: string;
  email: string;
  phone: string;
}

export const EMPTY_USER_DRAFT: UserDraft = { role: '', name: '', password: '', email: '', phone: '' };

export function buildUser(draft: UserDraft, acting: string | undefined): BuildResult<CreateUserDto> {
  const allowed = creatableRoles(acting);
  const role = allowed.find((r) => r === draft.role);
  const name = draft.name.trim().replace(/\s+/g, ' ');
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  const errors = {
    role: role ? undefined : 'Choose a role.',
    name: name === '' ? 'Enter a name.' : undefined,
    password: passwordError(draft.password),
    email: email !== '' && !EMAIL.test(email) ? 'Enter a valid email address.' : undefined,
  };
  if (Object.values(errors).some(Boolean) || !role) return fail(errors);
  // The password is sent exactly as typed: trimming would change what the person has to type to sign in.
  return {
    ok: true,
    body: { role, name, password: draft.password, ...(email && { email }), ...(phone && { phone }) },
  };
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** A random initial password with no look-alike characters (0/O, 1/l/I). `random` returns an integer in [0, max). */
export function generatePassword(random: (max: number) => number, length = 12): string {
  return Array.from({ length }, () => PASSWORD_ALPHABET[random(PASSWORD_ALPHABET.length)]).join('');
}

/** The browser's CSPRNG, without modulo bias. */
export function secureRandom(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while ((buffer[0] ?? 0) >= limit);
  return (buffer[0] ?? 0) % max;
}
