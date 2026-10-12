import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM,
  STEPS,
  canOpen,
  emptyQualification,
  firstOpenStep,
  fromDraftData,
  isTopDesignation,
  stepErrors,
  toDraftData,
  type RuleContext,
  type WizardForm,
} from './onboarding';

const ctx: RuleContext = {
  designations: [
    { id: 'mr', level: 1 },
    { id: 'zsm', level: 4 },
  ],
  today: '2026-10-09',
};

const address = {
  line1: '12 Park St',
  line2: '',
  district: 'Kolkata',
  state: 'West Bengal',
  pincode: '700016',
};

const complete: WizardForm = {
  ...EMPTY_FORM,
  name: 'Asha Rao',
  mobileNumber: '9830012345',
  guardianName: 'R. Rao',
  dateOfBirth: '1992-03-04',
  present: address,
  permanentSameAsPresent: true,
  bankName: 'SBI',
  accountNumber: '123456789',
  accountHolderName: 'Asha Rao',
  ifsc: 'SBIN0001234',
  branchName: 'Park Street',
  designationId: 'mr',
  zoneId: 'z1',
  hqId: 'h1',
  managerId: 'm1',
  payBandId: 'g1',
};

describe('step rules', () => {
  it('a complete form has no errors on any step', () => {
    for (const s of STEPS) expect(stepErrors(s.key, complete, ctx)).toEqual({});
  });

  it('personal: mobile is 10 digits, ESI 17 when given, alternate mobile optional', () => {
    const e = stepErrors(
      'personal',
      { ...complete, mobileNumber: '98300', esiNumber: '12', alternateMobile: '' },
      ctx,
    );
    expect(Object.keys(e).sort()).toEqual(['esiNumber', 'mobileNumber']);
  });

  it('personal: date of birth cannot be in the future', () => {
    expect(
      stepErrors('personal', { ...complete, dateOfBirth: '2027-01-01' }, ctx)['dateOfBirth'],
    ).toMatch(/future/);
  });

  it('address: the permanent block is only checked when it is not the same as present', () => {
    const different = { ...complete, permanentSameAsPresent: false };
    expect(Object.keys(stepErrors('address', different, ctx))).toContain('permanent.pincode');
    expect(stepErrors('address', complete, ctx)).toEqual({});
  });

  it('qualifications and experience are optional, but a started row must be whole', () => {
    expect(stepErrors('qualifications', complete, ctx)).toEqual({});
    const half = { ...complete, qualifications: [{ ...emptyQualification(), degree: 'BSc' }] };
    expect(Object.keys(stepErrors('qualifications', half, ctx)).sort()).toEqual([
      '0.institute',
      '0.yearOfPassing',
    ]);
  });

  it('experience: the end date cannot precede the joining date', () => {
    const form = {
      ...complete,
      experience: [{ id: 'x', companyName: 'X', joiningDate: '2020-05-01', endDate: '2019-01-01' }],
    };
    expect(stepErrors('experience', form, ctx)['0.endDate']).toMatch(/before/);
  });

  it('bank: every field is required and the IFSC is checked', () => {
    expect(Object.keys(stepErrors('bank', EMPTY_FORM, ctx))).toHaveLength(5);
    expect(stepErrors('bank', { ...complete, ifsc: 'bad' }, ctx)['ifsc']).toBeDefined();
    expect(stepErrors('bank', { ...complete, ifsc: 'sbin0001234' }, ctx)).toEqual({});
  });

  it('work: a manager is needed below the top designation and not at it', () => {
    const noManager = { ...complete, managerId: '' };
    expect(stepErrors('work', noManager, ctx)['managerId']).toBeDefined();
    expect(stepErrors('work', { ...noManager, designationId: 'zsm' }, ctx)).toEqual({});
  });

  it('pay: the grade is needed, the CTC is optional but must be an amount', () => {
    expect(
      stepErrors('compensation', { ...complete, payBandId: '' }, ctx)['payBandId'],
    ).toBeDefined();
    expect(stepErrors('compensation', { ...complete, ctc: 'abc' }, ctx)['ctc']).toBeDefined();
    expect(stepErrors('compensation', { ...complete, ctc: '600000' }, ctx)).toEqual({});
  });
});

describe('top designation', () => {
  it('is the highest level that exists', () => {
    expect(isTopDesignation('zsm', ctx.designations)).toBe(true);
    expect(isTopDesignation('mr', ctx.designations)).toBe(false);
    expect(isTopDesignation('', ctx.designations)).toBe(false);
  });
});

describe('moving between steps', () => {
  it('cannot open a step until every step before it is valid', () => {
    expect(canOpen('personal', EMPTY_FORM, ctx)).toBe(true);
    expect(canOpen('address', EMPTY_FORM, ctx)).toBe(false);
    expect(canOpen('address', complete, ctx)).toBe(true);
    expect(canOpen('review', complete, ctx)).toBe(true);
    expect(canOpen('review', { ...complete, bankName: '' }, ctx)).toBe(false);
  });

  it('opens a resumed draft at the first thing still missing', () => {
    expect(firstOpenStep(EMPTY_FORM, ctx)).toBe('personal');
    expect(firstOpenStep({ ...complete, bankName: '' }, ctx)).toBe('bank');
    expect(firstOpenStep(complete, ctx)).toBe('review');
  });
});

describe('draft', () => {
  it('leaves out blanks and anything not yet well-formed, so a half-typed form still saves', () => {
    const data = toDraftData({
      ...EMPTY_FORM,
      name: ' Asha  Rao ',
      mobileNumber: '98300',
      present: { ...address, pincode: '70' },
    });
    expect(data.personal).toEqual({ name: 'Asha Rao' });
    expect(data.address?.present).toEqual({
      line1: '12 Park St',
      district: 'Kolkata',
      state: 'West Bengal',
    });
    expect(data.bank).toEqual({});
  });

  it('round-trips a complete form', () => {
    const withMore: WizardForm = {
      ...complete,
      ctc: '600000',
      onProbation: true,
      probationMonths: '6',
      qualifications: [{ id: 'q', degree: 'BSc', institute: 'CU', yearOfPassing: '2014' }],
      experience: [{ id: 'x', companyName: 'Acme', joiningDate: '2015-01-01', endDate: '' }],
    };
    const back = fromDraftData(toDraftData(withMore));
    const noIds = (f: WizardForm) => ({
      ...f,
      qualifications: f.qualifications.map(({ id: _id, ...rest }) => rest),
      experience: f.experience.map(({ id: _id, ...rest }) => rest),
    });
    expect(noIds(back)).toEqual({ ...noIds(withMore), zoneId: '', managerName: '' });
  });

  it('keeps the CTC in paise', () => {
    expect(toDraftData({ ...complete, ctc: '600000' }).compensation?.ctcAnnualPaise).toBe(
      60_000_000,
    );
  });

  it("keeps this employee's own pay structure in the draft and brings it back", () => {
    const form: WizardForm = {
      ...complete,
      ctc: '144000',
      structure: {
        basicPercent: '40',
        rules: { FDA: { type: 'PERCENT_OF_COMPONENTS', percent: '14', of: ['BASIC'] } },
        removed: ['MEDICAL'],
        extras: [],
      },
    };
    const data = toDraftData(form, ['BASIC', 'FDA', 'MEDICAL']);
    expect(data.compensation?.structure).toEqual({
      basicBasisPoints: 4000,
      ruleOverrides: { FDA: { type: 'PERCENT_OF_COMPONENTS', basisPoints: 1400, of: ['BASIC'] } },
      removed: ['MEDICAL'],
      extras: [],
    });
    expect(fromDraftData(data).structure).toEqual(form.structure);
  });

  it('the pay step is blocked by an unfinished percentage', () => {
    const form: WizardForm = {
      ...complete,
      structure: { basicPercent: '4x', rules: {}, removed: [], extras: [] },
    };
    expect(stepErrors('compensation', form, ctx)['basicPercent']).toBeDefined();
  });
});
