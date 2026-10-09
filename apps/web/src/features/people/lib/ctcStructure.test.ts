import type { PayComponentDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_STRUCTURE_DRAFT,
  addExtra,
  buildAssignCtc,
  buildPreview,
  buildStructure,
  codeFromName,
  ctcTotals,
  dependentsOf,
  draftToRule,
  editorRows,
  removeLine,
  removedLines,
  restoreLine,
  setRule,
  structureToDraft,
} from './ctcStructure';

const org: PayComponentDto[] = [
  {
    id: '1',
    code: 'BASIC',
    name: 'Basic',
    kind: 'EARNING',
    order: 1,
    isActive: true,
    rule: { type: 'PERCENT_OF_CTC', basisPoints: 3000 },
  },
  {
    id: '2',
    code: 'FDA',
    name: 'FDA',
    kind: 'EARNING',
    order: 2,
    isActive: true,
    rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1000, of: ['BASIC'] },
  },
  {
    id: '3',
    code: 'MEDICAL',
    name: 'Medical allowance',
    kind: 'EARNING',
    order: 3,
    isActive: true,
    rule: { type: 'FIXED', amountPaise: 0 },
  },
  {
    id: '4',
    code: 'OTHER',
    name: 'Other allowance',
    kind: 'EARNING',
    order: 4,
    isActive: true,
    rule: { type: 'BALANCER' },
  },
  {
    id: '5',
    code: 'EPF',
    name: 'EPF (employer)',
    kind: 'EMPLOYER_CONTRIBUTION',
    order: 5,
    isActive: true,
    rule: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1200, of: ['BASIC', 'FDA'] },
  },
];
const codes = org.map((c) => c.code);

describe('buildStructure', () => {
  it('is nothing at all when nothing differs from the org formula', () => {
    expect(buildStructure(EMPTY_STRUCTURE_DRAFT, codes)).toEqual({ body: undefined, errors: {} });
  });

  it('carries Basic %, a changed rule, a removal and an added line', () => {
    let d = { ...EMPTY_STRUCTURE_DRAFT, basicPercent: '40' };
    d = setRule(d, 'FDA', { type: 'PERCENT_OF_COMPONENTS', percent: '14', of: ['BASIC'] });
    d = removeLine(d, 'MEDICAL');
    d = addExtra(d, {
      name: 'House rent',
      kind: 'EARNING',
      rule: { type: 'FIXED', amount: '9600' },
    });
    expect(buildStructure(d, codes)).toEqual({
      errors: {},
      body: {
        basicBasisPoints: 4000,
        ruleOverrides: { FDA: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1400, of: ['BASIC'] } },
        removed: ['MEDICAL'],
        extras: [
          {
            code: 'HOUSE_RENT',
            name: 'House rent',
            kind: 'EARNING',
            rule: { type: 'FIXED', amountPaise: 960_000 },
          },
        ],
      },
    });
  });

  it('keeps half-typed entries out of the body and names them in errors', () => {
    let d = { ...EMPTY_STRUCTURE_DRAFT, basicPercent: '4x' };
    d = setRule(d, 'FDA', { type: 'PERCENT_OF_COMPONENTS', percent: '1.', of: ['BASIC'] });
    d = addExtra(d, { name: '', kind: 'EARNING', rule: { type: 'FIXED', amount: '5' } });
    const built = buildStructure(d, codes);
    const keys = Object.keys(built.errors);
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(expect.arrayContaining(['basicPercent', 'rule:FDA']));
    expect(keys.some((k) => k.startsWith('extra:'))).toBe(true);
    expect(built.body).toBeUndefined();
  });

  it('refuses a Basic % outside 30 to 60', () => {
    expect(
      buildStructure({ ...EMPTY_STRUCTURE_DRAFT, basicPercent: '25' }, codes).errors[
        'basicPercent'
      ],
    ).toMatch(/between 30% and 60%/);
    expect(
      buildStructure({ ...EMPTY_STRUCTURE_DRAFT, basicPercent: '61' }, codes).errors[
        'basicPercent'
      ],
    ).toBeDefined();
    expect(
      buildStructure({ ...EMPTY_STRUCTURE_DRAFT, basicPercent: '37.5' }, codes).body
        ?.basicBasisPoints,
    ).toBe(3750);
  });

  it('drops the rule change of a line that was then removed', () => {
    const d = removeLine(
      setRule(EMPTY_STRUCTURE_DRAFT, 'MEDICAL', { type: 'FIXED', amount: '5000' }),
      'MEDICAL',
    );
    expect(buildStructure(d, codes).body?.ruleOverrides).toEqual({});
  });
});

describe('codeFromName', () => {
  it('upper-cases, joins words, and avoids a code already taken', () => {
    expect(codeFromName('House rent', new Set())).toBe('HOUSE_RENT');
    expect(codeFromName('HRA', new Set(['HRA']))).toBe('HRA_2');
    expect(codeFromName('  ', new Set())).toBe('LINE');
    expect(codeFromName('7 stars', new Set())).toBe('STARS');
  });
});

describe('editorRows', () => {
  it('starts as the org formula, with Basic and the balancer locked', () => {
    const rows = editorRows(org, EMPTY_STRUCTURE_DRAFT);
    expect(rows.map((r) => r.code)).toEqual(['BASIC', 'FDA', 'MEDICAL', 'OTHER', 'EPF']);
    expect(rows.filter((r) => r.lockedReason).map((r) => r.code)).toEqual(['BASIC', 'OTHER']);
    expect(rows.some((r) => r.edited)).toBe(false);
  });

  it("shows this employee's Basic %, an edited rule and an added line; a removed line is gone", () => {
    let d = { ...EMPTY_STRUCTURE_DRAFT, basicPercent: '40' };
    d = setRule(d, 'FDA', { type: 'PERCENT_OF_COMPONENTS', percent: '14', of: ['BASIC'] });
    d = removeLine(d, 'MEDICAL');
    d = addExtra(d, {
      name: 'Conveyance',
      kind: 'EARNING',
      rule: { type: 'FIXED', amount: '9600' },
    });
    const rows = editorRows(org, d);
    expect(rows.map((r) => r.code)).toEqual(['BASIC', 'FDA', 'OTHER', 'EPF', 'CONVEYANCE']);
    expect(rows[0]).toMatchObject({
      rule: { type: 'PERCENT_OF_CTC', percent: '40' },
      edited: true,
    });
    expect(rows[1]).toMatchObject({ rule: { percent: '14' }, edited: true });
    expect(rows[4]?.extraId).toBeDefined();
    expect(removedLines(org, d).map((c) => c.code)).toEqual(['MEDICAL']);
    expect(removedLines(org, restoreLine(d, 'MEDICAL'))).toEqual([]);
  });

  it('knows which lines depend on another, so it cannot be removed under them', () => {
    const rows = editorRows(org, EMPTY_STRUCTURE_DRAFT);
    expect(dependentsOf('FDA', rows)).toEqual(['EPF (employer)']);
    expect(dependentsOf('MEDICAL', rows)).toEqual([]);
  });
});

describe('structureToDraft', () => {
  it('round-trips a stored structure', () => {
    const stored = {
      basicBasisPoints: 4000,
      ruleOverrides: {
        FDA: { type: 'PERCENT_OF_COMPONENTS' as const, basisPoints: 1400, of: ['BASIC'] },
      },
      removed: ['MEDICAL'],
      extras: [
        {
          code: 'CONVEYANCE',
          name: 'Conveyance',
          kind: 'EARNING' as const,
          rule: { type: 'FIXED' as const, amountPaise: 960_000 },
        },
      ],
    };
    const back = buildStructure(structureToDraft(stored), codes).body;
    expect(back).toEqual({ ...stored, extras: [{ ...stored.extras[0], code: 'CONVEYANCE' }] });
  });

  it('turns an older per-line amount into a fixed-amount rule', () => {
    const d = structureToDraft(undefined, { MEDICAL: 600_000 });
    expect(d.rules['MEDICAL']).toEqual({ type: 'FIXED', amount: '6000' });
    expect(draftToRule(d.rules['MEDICAL']!)).toEqual({ type: 'FIXED', amountPaise: 600_000 });
  });
});

describe('the CTC form', () => {
  it('previews only once the CTC is usable, and carries the structure when there is one', () => {
    expect(buildPreview('', EMPTY_STRUCTURE_DRAFT, codes)).toBeNull();
    expect(buildPreview('0', EMPTY_STRUCTURE_DRAFT, codes)).toBeNull();
    expect(buildPreview('144000', EMPTY_STRUCTURE_DRAFT, codes)).toEqual({
      ctcAnnualPaise: 14_400_000,
    });
    expect(buildPreview('144000', { ...EMPTY_STRUCTURE_DRAFT, basicPercent: '40' }, codes)).toEqual(
      {
        ctcAnnualPaise: 14_400_000,
        structure: { basicBasisPoints: 4000, ruleOverrides: {}, removed: [], extras: [] },
      },
    );
  });

  it('ignores a half-typed percentage while previewing', () => {
    expect(buildPreview('144000', { ...EMPTY_STRUCTURE_DRAFT, basicPercent: '4.' }, codes)).toEqual(
      { ctcAnnualPaise: 14_400_000 },
    );
  });

  it('builds the save body, with the structure and reason only when present', () => {
    const draft = {
      ctc: '144000',
      effectiveFrom: '2026-10',
      reason: '',
      structure: EMPTY_STRUCTURE_DRAFT,
    };
    expect(buildAssignCtc(draft, codes)).toEqual({
      ok: true,
      body: { ctcAnnualPaise: 14_400_000, effectiveFrom: '2026-10' },
    });
    expect(
      buildAssignCtc(
        {
          ...draft,
          ctc: '180000',
          reason: ' Annual  review ',
          structure: { ...EMPTY_STRUCTURE_DRAFT, basicPercent: '40' },
        },
        codes,
      ),
    ).toEqual({
      ok: true,
      body: {
        ctcAnnualPaise: 18_000_000,
        effectiveFrom: '2026-10',
        structure: { basicBasisPoints: 4000, ruleOverrides: {}, removed: [], extras: [] },
        reason: 'Annual review',
      },
    });
  });

  it('refuses a missing CTC or month and an unfinished entry, per field', () => {
    const r = buildAssignCtc(
      {
        ctc: '',
        effectiveFrom: '',
        reason: '',
        structure: { ...EMPTY_STRUCTURE_DRAFT, basicPercent: 'abc' },
      },
      codes,
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual(['basicPercent', 'ctc', 'effectiveFrom']);
  });

  it('does not tie the CTC to a grade: any amount above zero builds', () => {
    for (const ctc of ['1', '100000', '300000.01', '9000000'])
      expect(
        buildAssignCtc(
          { ctc, effectiveFrom: '2026-10', reason: '', structure: EMPTY_STRUCTURE_DRAFT },
          codes,
        ),
      ).toMatchObject({ ok: true });
  });
});

describe('ctcTotals', () => {
  it('splits what the employee is paid from what the employer puts in, and adds them to the CTC', () => {
    const t = ctcTotals([
      { kind: 'EARNING', amountPaise: 10_000_000 },
      { kind: 'EARNING', amountPaise: 3_000_000 },
      { kind: 'EMPLOYER_CONTRIBUTION', amountPaise: 1_400_000 },
    ]);
    expect(t).toEqual({ paidPaise: 13_000_000, employerPaise: 1_400_000, totalPaise: 14_400_000 });
    expect(ctcTotals([])).toEqual({ paidPaise: 0, employerPaise: 0, totalPaise: 0 });
  });
});
