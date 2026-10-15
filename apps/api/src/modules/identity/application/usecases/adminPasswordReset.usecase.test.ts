import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PasswordResetRequest } from '../../domain/passwordResetRequest.entity.js';
import { ConfirmAdminPasswordResetUseCase, RequestAdminPasswordResetUseCase } from './adminPasswordReset.usecase.js';

const NOW = new Date('2026-10-15T10:00:00Z');

function build(opts: { config?: Record<string, string>; failMail?: boolean } = {}) {
  const config: Record<string, string> = { PASSWORD_RESET_OWNER_EMAIL: 'owner@example.com', PASSWORD_RESET_DAILY_LIMIT: '3', ...opts.config };
  const accounts: Record<string, { id: string; employeeCode: string; name: string; status: string; roleId: string; passwordHash: string }> = {
    GHC001: { id: 'u1', employeeCode: 'GHC001', name: 'Admin One', status: 'active', roleId: 'admin', passwordHash: 'old' },
    GHC002: { id: 'u2', employeeCode: 'GHC002', name: 'Field', status: 'active', roleId: 'field', passwordHash: 'old' },
    GHC003: { id: 'u3', employeeCode: 'GHC003', name: 'Gone Admin', status: 'inactive', roleId: 'admin', passwordHash: 'old' },
  };
  const rows: PasswordResetRequest[] = [];
  const sent: Array<{ to: string; text: string }> = [];
  const revoked: string[] = [];
  let seq = 0;
  const users = {
    findByEmployeeCode: async (c: string) => accounts[c] ?? null,
    update: async (id: string, patch: { passwordHash?: string }) => {
      const a = Object.values(accounts).find((x) => x.id === id)!;
      Object.assign(a, patch);
      return a;
    },
  };
  const roles = { findById: async (id: string) => ({ id, name: id === 'admin' ? 'ADMIN' : 'FIELD' }) };
  const requests = {
    create: async (input: Omit<PasswordResetRequest, 'id'>) => {
      const row = { ...input, id: `r${++seq}` };
      rows.push(row);
      return row;
    },
    countCreatedSince: async (since: Date) => rows.filter((r) => r.createdAt >= since).length,
    findOpenForUser: async (userId: string, now: Date) => [...rows].reverse().find((r) => r.userId === userId && !r.usedAt && r.expiresAt > now) ?? null,
    addAttempt: async (id: string) => ++rows.find((r) => r.id === id)!.attempts,
    markUsed: async (id: string, at: Date) => {
      const r = rows.find((x) => x.id === id)!;
      if (r.usedAt) return false;
      r.usedAt = at;
      return true;
    },
    closeOpenForUser: async (userId: string, at: Date) => rows.filter((r) => r.userId === userId && !r.usedAt).forEach((r) => (r.usedAt = at)),
    delete: async (id: string) => void rows.splice(rows.findIndex((r) => r.id === id), 1),
  };
  const hasher = { hash: async (p: string) => `h:${p}`, verify: async (p: string, h: string) => h === `h:${p}` };
  const mailer = {
    send: async (m: { to: string; text: string }) => {
      if (opts.failMail) throw new Error('smtp down');
      sent.push(m);
    },
  };
  const configReader = {
    get: async (k: string) => {
      if (!(k in config)) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key: k });
      return config[k]!;
    },
  };
  const deps = { users, roles, requests, hasher, mailer, config: configReader, now: () => NOW } as never;
  const sessions = { revokeAllForUser: async (id: string) => void revoked.push(id) };
  return {
    request: new RequestAdminPasswordResetUseCase(deps),
    confirm: new ConfirmAdminPasswordResetUseCase({ ...(deps as object), sessions } as never),
    rows,
    sent,
    revoked,
    accounts,
    codeSent: () => /Code: (\d{6})/.exec(sent.at(-1)!.text)![1]!,
  };
}

describe('RequestAdminPasswordResetUseCase', () => {
  it('emails the owner a code for an active Admin, and stores only its hash', async () => {
    const t = build();
    await t.request.execute('GHC001');
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.to).toBe('owner@example.com');
    expect(t.rows[0]!.otpHash).not.toBe(t.codeSent());
  });

  it('does nothing, and counts nothing, for a non-admin, an inactive admin or an unknown ID', async () => {
    const t = build();
    for (const code of ['GHC002', 'GHC003', 'NOPE']) await t.request.execute(code);
    expect(t.sent).toHaveLength(0);
    expect(t.rows).toHaveLength(0);
  });

  it('sends nothing when the owner email is NONE', async () => {
    const t = build({ config: { PASSWORD_RESET_OWNER_EMAIL: 'NONE' } });
    await t.request.execute('GHC001');
    expect(t.sent).toHaveLength(0);
  });

  it('stops after the daily limit from Settings', async () => {
    const t = build({ config: { PASSWORD_RESET_DAILY_LIMIT: '2' } });
    for (let i = 0; i < 4; i++) await t.request.execute('GHC001');
    expect(t.sent).toHaveLength(2);
  });

  it('does not count a request whose mail failed', async () => {
    const t = build({ failMail: true });
    await t.request.execute('GHC001');
    expect(t.rows).toHaveLength(0);
  });

  it('replaces the earlier code with the new one', async () => {
    const t = build();
    await t.request.execute('GHC001');
    const first = t.codeSent();
    await t.request.execute('GHC001');
    await expect(t.confirm.execute({ employeeCode: 'GHC001', otp: first, newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
  });
});

describe('ConfirmAdminPasswordResetUseCase', () => {
  it('sets the password, ends every session and uses the code up', async () => {
    const t = build();
    await t.request.execute('GHC001');
    const otp = t.codeSent();
    await t.confirm.execute({ employeeCode: 'GHC001', otp, newPassword: 'newpassword1' });
    expect(t.accounts.GHC001!.passwordHash).toBe('h:newpassword1');
    expect(t.revoked).toEqual(['u1']);
    await expect(t.confirm.execute({ employeeCode: 'GHC001', otp, newPassword: 'another-pass1' })).rejects.toBeInstanceOf(AppError);
  });

  it('refuses a wrong code and locks after five wrong tries, even for the right code', async () => {
    const t = build();
    await t.request.execute('GHC001');
    const otp = t.codeSent();
    for (let i = 0; i < 5; i++) await expect(t.confirm.execute({ employeeCode: 'GHC001', otp: '000000', newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
    await expect(t.confirm.execute({ employeeCode: 'GHC001', otp, newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
    expect(t.accounts.GHC001!.passwordHash).toBe('old');
  });

  it('refuses an expired code and a non-admin', async () => {
    const t = build();
    await t.request.execute('GHC001');
    t.rows[0]!.expiresAt = new Date(NOW.getTime() - 1);
    await expect(t.confirm.execute({ employeeCode: 'GHC001', otp: t.codeSent(), newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
    await expect(t.confirm.execute({ employeeCode: 'GHC002', otp: '123456', newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
  });
});
