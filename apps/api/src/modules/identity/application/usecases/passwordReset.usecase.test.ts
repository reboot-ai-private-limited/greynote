import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PasswordResetRequest } from '../../domain/passwordResetRequest.entity.js';
import { ConfirmPasswordResetUseCase, RequestPasswordResetUseCase } from './passwordReset.usecase.js';

const NOW = new Date('2026-10-15T10:00:00Z');

function build(opts: { ownerEmail?: string | undefined; failMail?: boolean; mailMissing?: boolean; devLog?: boolean } = {}) {
  const ownerEmail = 'ownerEmail' in opts ? opts.ownerEmail : 'owner@example.com';
  type Acct = { id: string; employeeCode: string; name: string; email: string | null; status: string; roleId: string; passwordHash: string; isDemo?: boolean };
  const accounts: Record<string, Acct> = {
    GHC001: { id: 'u1', employeeCode: 'GHC001', name: 'Admin One', email: null, status: 'active', roleId: 'admin', passwordHash: 'old' },
    GHC002: { id: 'u2', employeeCode: 'GHC002', name: 'Asha', email: 'asha@example.com', status: 'active', roleId: 'field', passwordHash: 'old' },
    GHC003: { id: 'u3', employeeCode: 'GHC003', name: 'Gone', email: 'gone@example.com', status: 'inactive', roleId: 'field', passwordHash: 'old' },
    GHC004: { id: 'u4', employeeCode: 'GHC004', name: 'No Email', email: null, status: 'active', roleId: 'field', passwordHash: 'old' },
    GHC005: { id: 'u5', employeeCode: 'GHC005', name: 'Admin Two', email: 'admin2@example.com', status: 'active', roleId: 'admin', passwordHash: 'old' },
  };
  const rows: PasswordResetRequest[] = [];
  const sent: Array<{ to: string; text: string }> = [];
  const revoked: string[] = [];
  let seq = 0;
  let clock = NOW;
  const users = {
    findByEmployeeCode: async (c: string) => accounts[c] ?? null,
    listActive: async () => Object.values(accounts).filter((a) => a.status === 'active'),
    update: async (id: string, patch: { passwordHash?: string }) => {
      const a = Object.values(accounts).find((x) => x.id === id)!;
      Object.assign(a, patch);
      return a;
    },
  };
  const roles = { findById: async (id: string) => ({ id, name: id === 'admin' ? 'ADMIN' : 'FIELD' }), findByName: async (name: string) => (name === 'ADMIN' ? { id: 'admin', name } : { id: 'field', name }) };
  const requests = {
    create: async (input: Omit<PasswordResetRequest, 'id'>) => {
      const row = { ...input, id: `r${++seq}` };
      rows.push(row);
      return row;
    },
    countForUserSince: async (userId: string, since: Date) => rows.filter((r) => r.userId === userId && r.createdAt >= since).length,
    latestCreatedAtForUser: async (userId: string) => [...rows].reverse().find((r) => r.userId === userId)?.createdAt ?? null,
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
      if (opts.mailMissing) throw AppError.internal('INTERNAL', { reason: 'MAIL_NOT_CONFIGURED' });
      if (opts.failMail) throw new Error('smtp down');
      sent.push(m);
    },
  };
  const deps = { users, roles, requests, hasher, mailer, ownerEmail, logCodeWhenMailMissing: opts.devLog ?? false, now: () => clock } as never;
  const sessions = { revokeAllForUser: async (id: string) => void revoked.push(id) };
  return {
    request: new RequestPasswordResetUseCase(deps),
    confirm: new ConfirmPasswordResetUseCase({ ...(deps as object), sessions } as never),
    rows,
    sent,
    revoked,
    accounts,
    later: (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000)),
    codeSent: () => /(?:Code: |code is )(\d{6})/.exec(sent.at(-1)!.text)![1]!,
  };
}

describe('asking for a code', () => {
  it('emails a code to the person’s own address and stores only its hash', async () => {
    const t = build();
    expect(await t.request.execute('GHC002')).toEqual({ delivery: 'EMAIL' });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.to).toBe('asha@example.com');
    expect(t.rows[0]!.otpHash).not.toBe(t.codeSent());
  });

  it('an account with no email is told to contact an Admin, with an Admin who has an email', async () => {
    const t = build();
    expect(await t.request.execute('GHC004')).toEqual({ delivery: 'NO_EMAIL', admin: { name: 'Admin Two', email: 'admin2@example.com' } });
    expect(t.sent).toHaveLength(0);
  });

  it('an Admin with no email of their own gets the code at the owner’s address; with no owner address either, they are told to contact an Admin', async () => {
    const t = build();
    await t.request.execute('GHC001');
    expect(t.sent[0]!.to).toBe('owner@example.com');
    const none = build({ ownerEmail: undefined });
    expect((await none.request.execute('GHC001')).delivery).toBe('NO_EMAIL');
  });

  it('an unknown ID or an inactive account gets the same answer as a sent code, and nothing is sent or counted', async () => {
    const t = build();
    for (const code of ['GHC003', 'NOPE']) expect(await t.request.execute(code)).toEqual({ delivery: 'EMAIL' });
    expect(t.sent).toHaveLength(0);
    expect(t.rows).toHaveLength(0);
  });

  it('waits a minute between codes and stops after five in a day', async () => {
    const t = build();
    await t.request.execute('GHC002');
    await t.request.execute('GHC002'); // too soon
    expect(t.sent).toHaveLength(1);
    for (let i = 0; i < 6; i++) {
      t.later(61);
      await t.request.execute('GHC002');
    }
    expect(t.sent).toHaveLength(5);
  });

  it('does not count a request whose mail failed', async () => {
    const t = build({ failMail: true });
    await t.request.execute('GHC002');
    expect(t.rows).toHaveLength(0);
  });

  it('in development with no mail server the code is kept (and logged) so the flow can be tried; never otherwise', async () => {
    const dev = build({ mailMissing: true, devLog: true });
    await dev.request.execute('GHC002');
    expect(dev.rows).toHaveLength(1);
    const prod = build({ mailMissing: true, devLog: false });
    await prod.request.execute('GHC002');
    expect(prod.rows).toHaveLength(0);
  });

  it('replaces the earlier code with the new one', async () => {
    const t = build();
    await t.request.execute('GHC002');
    const first = t.codeSent();
    t.later(61);
    await t.request.execute('GHC002');
    await expect(t.confirm.execute({ employeeCode: 'GHC002', otp: first, newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
  });
});

describe('setting the new password', () => {
  it('sets the password, ends every session, uses the code up, and tells the person', async () => {
    const t = build();
    await t.request.execute('GHC002');
    const otp = t.codeSent();
    await t.confirm.execute({ employeeCode: 'GHC002', otp, newPassword: 'newpassword1' });
    expect(t.accounts.GHC002!.passwordHash).toBe('h:newpassword1');
    expect(t.revoked).toEqual(['u2']);
    expect(t.sent.at(-1)!.to).toBe('asha@example.com');
    await expect(t.confirm.execute({ employeeCode: 'GHC002', otp, newPassword: 'another-pass1' })).rejects.toBeInstanceOf(AppError);
  });

  it('refuses a wrong code and locks after five wrong tries, even for the right code', async () => {
    const t = build();
    await t.request.execute('GHC002');
    const otp = t.codeSent();
    for (let i = 0; i < 5; i++) await expect(t.confirm.execute({ employeeCode: 'GHC002', otp: '000000', newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
    await expect(t.confirm.execute({ employeeCode: 'GHC002', otp, newPassword: 'newpassword1' })).rejects.toBeInstanceOf(AppError);
    expect(t.accounts.GHC002!.passwordHash).toBe('old');
  });

  it('refuses an expired code, an inactive account and an unknown ID, all with the same message', async () => {
    const t = build();
    await t.request.execute('GHC002');
    const otp = t.codeSent();
    t.later(11 * 60);
    const failures = await Promise.all([
      t.confirm.execute({ employeeCode: 'GHC002', otp, newPassword: 'newpassword1' }).catch((e: AppError) => e.message),
      t.confirm.execute({ employeeCode: 'GHC003', otp, newPassword: 'newpassword1' }).catch((e: AppError) => e.message),
      t.confirm.execute({ employeeCode: 'NOPE', otp, newPassword: 'newpassword1' }).catch((e: AppError) => e.message),
    ]);
    expect(new Set(failures).size).toBe(1);
  });
});
