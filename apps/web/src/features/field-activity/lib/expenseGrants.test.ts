import { describe, expect, it } from 'vitest';
import { buildExpenseGrant, type ExpenseGrantForm } from './expenseGrants';

const form: ExpenseGrantForm = {
  userId: 'u1',
  month: '2026-09',
  phase: 'SUBMIT',
  reason: ' on leave ',
  expiresAt: '',
};
const NOW = new Date('2026-10-08T00:00:00Z');

describe('buildExpenseGrant', () => {
  it('builds a request, trimmed, without an end time when none is given', () => {
    expect(buildExpenseGrant(form, 'Asia/Kolkata', NOW)).toEqual({
      ok: true,
      body: { userId: 'u1', month: '2026-09', phase: 'SUBMIT', reason: 'on leave' },
    });
  });

  it('turns the typed end time in the business timezone into an instant', () => {
    const built = buildExpenseGrant(
      { ...form, expiresAt: '2026-10-10T18:30' },
      'Asia/Kolkata',
      NOW,
    );
    expect(built).toMatchObject({ ok: true, body: { expiresAt: '2026-10-10T13:00:00.000Z' } });
  });

  it('names what is missing or wrong', () => {
    const built = buildExpenseGrant(
      { ...form, userId: '', month: '', reason: ' ', expiresAt: '2026-10-01T10:00' },
      'Asia/Kolkata',
      NOW,
    );
    expect(built).toEqual({
      ok: false,
      errors: {
        userId: 'Choose an employee.',
        month: 'Choose the month.',
        reason: 'A reason is required.',
        expiresAt: 'Pick a time in the future.',
      },
    });
  });
});
