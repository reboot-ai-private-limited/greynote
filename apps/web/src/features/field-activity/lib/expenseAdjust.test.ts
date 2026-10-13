import { describe, expect, it } from 'vitest';
import { addableTypes, buildDayOps, describeAdjustment, emptyDayForm, wasPaise } from './expenseAdjust';

const row = (over: object) => ({ id: 'r1', type: 'TA', amountPaise: 8000, originalAmountPaise: null, source: 'AUTO', remarks: null, paid: false, ...over }) as never;

describe('buildDayOps', () => {
  const day = { rows: [row({ id: 'ta', type: 'TA', amountPaise: 8000 }), row({ id: 'oth', type: 'OTHER', amountPaise: 1500 })] };

  it('sends only what changed, with the reason', () => {
    const form = { ...emptyDayForm(day), reason: ' Wrong distance ' };
    form.amounts['ta'] = '60';
    expect(buildDayOps(day, form)).toEqual({ ok: true, ops: [{ kind: 'edit', id: 'ta', amountPaise: 6000 }], reason: 'Wrong distance' });
  });

  it('allows lowering to zero, and adding a TA or DA the day does not have', () => {
    const form = { ...emptyDayForm(day), reason: 'Fix' };
    form.amounts['oth'] = '0';
    form.adds = { DA: '200' };
    expect(buildDayOps(day, form)).toMatchObject({ ok: true, ops: [{ kind: 'edit', id: 'oth', amountPaise: 0 }, { kind: 'add', type: 'DA', amountPaise: 20000 }] });
    expect(addableTypes(day)).toEqual(['DA']);
  });

  it('refuses nothing changed, a bad amount, and a missing reason', () => {
    expect(buildDayOps(day, emptyDayForm(day))).toEqual({ ok: false, errors: { form: 'Nothing has changed.' } });
    const bad = emptyDayForm(day);
    bad.amounts['ta'] = 'abc';
    expect(buildDayOps(day, bad)).toMatchObject({ ok: false, errors: { ta: expect.any(String) } });
    const noReason = emptyDayForm(day);
    noReason.amounts['ta'] = '10';
    expect(buildDayOps(day, noReason)).toEqual({ ok: false, errors: { reason: 'A reason is required.' } });
    const zeroAdd = { ...emptyDayForm(day), reason: 'x', adds: { DA: '0' } };
    expect(buildDayOps(day, zeroAdd)).toMatchObject({ ok: false, errors: { 'add-DA': expect.any(String) } });
  });

  it('leaves a paid row alone', () => {
    const paid = { rows: [row({ id: 'ta', paid: true })] };
    const form = { ...emptyDayForm(paid), reason: 'x' };
    form.amounts['ta'] = '1';
    expect(buildDayOps(paid, form)).toEqual({ ok: false, errors: { form: 'Nothing has changed.' } });
  });
});

describe('wasPaise', () => {
  it('shows the first amount only for a kind that HR changed', () => {
    const day = { rows: [row({ id: 'ta', type: 'TA', amountPaise: 6000, originalAmountPaise: 8000 }), row({ id: 'da', type: 'DA', amountPaise: 20000 })] };
    expect(wasPaise(day, 'TA')).toBe(8000);
    expect(wasPaise(day, 'DA')).toBeNull();
    expect(wasPaise(day, 'OTHER')).toBeNull();
    expect(wasPaise({ rows: [row({ amountPaise: 8000, originalAmountPaise: 8000 })] }, 'TA')).toBeNull(); // changed and put back
  });
});

describe('describeAdjustment', () => {
  it('says raised, lowered or added', () => {
    expect(describeAdjustment({ type: 'TA', kind: 'EDIT', beforePaise: 8000, afterPaise: 6000 })).toMatch(/^TA lowered .*80.* → .*60/);
    expect(describeAdjustment({ type: 'DA', kind: 'EDIT', beforePaise: 100, afterPaise: 200 })).toMatch(/^DA raised/);
    expect(describeAdjustment({ type: 'DA', kind: 'ADD', beforePaise: 0, afterPaise: 3000 })).toMatch(/^DA added .*30/);
    expect(describeAdjustment({ type: 'MEAL', kind: 'EDIT', beforePaise: 1, afterPaise: 0 })).toMatch(/^Other lowered/);
  });
});
