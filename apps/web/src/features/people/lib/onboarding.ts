import type { DesignationDto, EmployeeDraftDataDto } from '@greynote/contracts';
import { paiseToRupees } from '@/lib/money';
import { parseCtc } from './ctc';
import {
  EMPTY_STRUCTURE_DRAFT,
  buildStructure,
  structureToDraft,
  type StructureDraft,
} from './ctcStructure';

/**
 * The new-employee wizard's form, as strings, and the rules that go with it. Pure, so the step order, what blocks
 * "Next" and what a draft keeps are tested without a browser. The API checks the same things again.
 */

export const STEPS = [
  { key: 'personal', label: 'Personal', required: true },
  { key: 'address', label: 'Address', required: true },
  { key: 'qualifications', label: 'Qualifications', required: false },
  { key: 'experience', label: 'Experience', required: false },
  { key: 'bank', label: 'Bank', required: true },
  { key: 'work', label: 'Work', required: true },
  { key: 'compensation', label: 'Pay', required: true },
  { key: 'review', label: 'Review', required: true },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];

export interface AddressForm {
  line1: string;
  line2: string;
  district: string;
  state: string;
  pincode: string;
}
/** A client-only id so a row keeps its identity when another is removed; never sent. */
let rowSeq = 0;
const rowId = (): string => `row-${++rowSeq}`;

export interface QualificationRow {
  id: string;
  degree: string;
  institute: string;
  yearOfPassing: string;
}
export interface ExperienceRow {
  id: string;
  companyName: string;
  joiningDate: string;
  endDate: string;
}

export interface WizardForm {
  name: string;
  mobileNumber: string;
  alternateMobile: string;
  guardianName: string;
  dateOfBirth: string;
  esiNumber: string;
  dateOfJoining: string;
  probationMonths: string;
  present: AddressForm;
  permanent: AddressForm;
  permanentSameAsPresent: boolean;
  qualifications: QualificationRow[];
  experience: ExperienceRow[];
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifsc: string;
  branchName: string;
  designationId: string;
  zoneId: string;
  hqId: string;
  managerId: string;
  /** For display only; not saved. */
  managerName: string;
  payBandId: string;
  /** Rupees a year, '' = not set yet. */
  ctc: string;
  /** This employee's own Basic %, changed, removed and added lines. */
  structure: StructureDraft;
}

const EMPTY_ADDRESS: AddressForm = { line1: '', line2: '', district: '', state: '', pincode: '' };

export const EMPTY_FORM: WizardForm = {
  name: '',
  mobileNumber: '',
  alternateMobile: '',
  guardianName: '',
  dateOfBirth: '',
  esiNumber: '',
  dateOfJoining: '',
  probationMonths: '',
  present: EMPTY_ADDRESS,
  permanent: EMPTY_ADDRESS,
  permanentSameAsPresent: false,
  qualifications: [],
  experience: [],
  bankName: '',
  accountNumber: '',
  accountHolderName: '',
  ifsc: '',
  branchName: '',
  designationId: '',
  zoneId: '',
  hqId: '',
  managerId: '',
  managerName: '',
  payBandId: '',
  ctc: '',
  structure: EMPTY_STRUCTURE_DRAFT,
};

export const emptyQualification = (): QualificationRow => ({
  id: rowId(),
  degree: '',
  institute: '',
  yearOfPassing: '',
});
export const emptyExperience = (): ExperienceRow => ({
  id: rowId(),
  companyName: '',
  joiningDate: '',
  endDate: '',
});

// ── Field rules ────────────────────────────────────────────────────────────────────────────

const squash = (s: string) => s.trim().replace(/\s+/g, ' ');
const MOBILE = /^\d{10}$/;
const PINCODE = /^\d{6}$/;
const ESI = /^\d{17}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^\d{6,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRealDate = (value: string): boolean => {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

/** The permanent address the employee will have: the present one while "same as present" is ticked. */
export const effectivePermanent = (form: WizardForm): AddressForm =>
  form.permanentSameAsPresent ? form.present : form.permanent;

/** Whether this designation is the top of the hierarchy: the highest level that exists. It reports to nobody. */
export function isTopDesignation(
  designationId: string,
  designations: readonly Pick<DesignationDto, 'id' | 'level'>[],
): boolean {
  if (!designationId || designations.length === 0) return false;
  const top = Math.max(...designations.map((d) => d.level));
  return designations.some((d) => d.id === designationId && d.level === top);
}

export interface RuleContext {
  designations: readonly Pick<DesignationDto, 'id' | 'level'>[];
  /** Today, `YYYY-MM-DD`, for "not in the future" checks. */
  today: string;
  /** Codes of the org's pay components, so a line added for this employee gets a code of its own. */
  orgCodes?: readonly string[];
}

type Errors = Record<string, string>;
const put = (errors: Errors, key: string, message: string | undefined) => {
  if (message) errors[key] = message;
};

function addressErrors(a: AddressForm, prefix: string): Errors {
  const e: Errors = {};
  put(e, `${prefix}.line1`, squash(a.line1) ? undefined : 'Enter the address.');
  put(e, `${prefix}.district`, squash(a.district) ? undefined : 'Enter the district or city.');
  put(e, `${prefix}.state`, squash(a.state) ? undefined : 'Enter the state.');
  put(
    e,
    `${prefix}.pincode`,
    PINCODE.test(a.pincode.trim()) ? undefined : 'Enter a 6-digit pincode.',
  );
  return e;
}

/** What is wrong on one step, per field (`{}` = fine). Optional fields are checked only when filled. */
export function stepErrors(step: StepKey, form: WizardForm, ctx: RuleContext): Errors {
  const e: Errors = {};
  switch (step) {
    case 'personal': {
      put(e, 'name', squash(form.name) ? undefined : 'Enter a name.');
      put(
        e,
        'mobileNumber',
        MOBILE.test(form.mobileNumber.trim()) ? undefined : 'Enter a 10-digit mobile number.',
      );
      if (form.alternateMobile.trim()) {
        put(
          e,
          'alternateMobile',
          MOBILE.test(form.alternateMobile.trim()) ? undefined : 'Enter a 10-digit mobile number.',
        );
      }
      put(e, 'guardianName', squash(form.guardianName) ? undefined : 'Enter the guardian’s name.');
      put(
        e,
        'dateOfBirth',
        !form.dateOfBirth
          ? 'Enter the date of birth.'
          : !isRealDate(form.dateOfBirth)
            ? 'Enter a valid date.'
            : form.dateOfBirth > ctx.today
              ? 'The date of birth cannot be in the future.'
              : undefined,
      );
      if (form.esiNumber.trim())
        put(
          e,
          'esiNumber',
          ESI.test(form.esiNumber.trim()) ? undefined : 'The ESI number is exactly 17 digits.',
        );
      if (form.dateOfJoining)
        put(e, 'dateOfJoining', isRealDate(form.dateOfJoining) ? undefined : 'Enter a valid date.');
      if (form.probationMonths.trim()) {
        const months = Number(form.probationMonths);
        put(
          e,
          'probationMonths',
          Number.isInteger(months) && months >= 0 && months <= 36
            ? undefined
            : 'Use whole months, 0 to 36.',
        );
      }
      break;
    }
    case 'address':
      Object.assign(e, addressErrors(form.present, 'present'));
      if (!form.permanentSameAsPresent)
        Object.assign(e, addressErrors(form.permanent, 'permanent'));
      break;
    case 'qualifications':
      form.qualifications.forEach((row, i) => {
        put(
          e,
          `${i}.degree`,
          squash(row.degree) ? undefined : 'Enter the degree or qualification.',
        );
        put(
          e,
          `${i}.institute`,
          squash(row.institute) ? undefined : 'Enter the board or institute.',
        );
        const year = Number(row.yearOfPassing);
        put(
          e,
          `${i}.yearOfPassing`,
          Number.isInteger(year) && year >= 1950 && year <= Number(ctx.today.slice(0, 4))
            ? undefined
            : 'Enter the year, e.g. 2016.',
        );
      });
      break;
    case 'experience':
      form.experience.forEach((row, i) => {
        put(e, `${i}.companyName`, squash(row.companyName) ? undefined : 'Enter the company name.');
        put(
          e,
          `${i}.joiningDate`,
          isRealDate(row.joiningDate) ? undefined : 'Enter the joining date.',
        );
        if (row.endDate) {
          put(
            e,
            `${i}.endDate`,
            !isRealDate(row.endDate)
              ? 'Enter a valid date.'
              : row.joiningDate && row.endDate < row.joiningDate
                ? 'The end date is before the joining date.'
                : undefined,
          );
        }
      });
      break;
    case 'bank':
      put(e, 'bankName', squash(form.bankName) ? undefined : 'Enter the bank name.');
      put(
        e,
        'accountNumber',
        ACCOUNT.test(form.accountNumber.trim())
          ? undefined
          : 'Enter the account number, 6 to 20 digits.',
      );
      put(
        e,
        'accountHolderName',
        squash(form.accountHolderName) ? undefined : 'Enter the account holder’s name.',
      );
      put(
        e,
        'ifsc',
        IFSC.test(form.ifsc.trim().toUpperCase())
          ? undefined
          : 'Enter the IFSC code, e.g. SBIN0001234.',
      );
      put(e, 'branchName', squash(form.branchName) ? undefined : 'Enter the branch name.');
      break;
    case 'work':
      put(e, 'designationId', form.designationId ? undefined : 'Choose a designation.');
      put(e, 'zoneId', form.zoneId ? undefined : 'Choose a zone.');
      put(e, 'hqId', form.hqId ? undefined : 'Choose an HQ.');
      if (!isTopDesignation(form.designationId, ctx.designations)) {
        put(e, 'managerId', form.managerId ? undefined : 'Choose a manager.');
      }
      break;
    case 'compensation':
      put(e, 'payBandId', form.payBandId ? undefined : 'Choose a pay grade.');
      if (form.ctc.trim())
        put(e, 'ctc', parseCtc(form.ctc) === null ? 'Enter the yearly CTC in rupees.' : undefined);
      Object.assign(e, buildStructure(form.structure, ctx.orgCodes ?? []).errors);
      break;
    case 'review':
      break;
  }
  return e;
}

/** The step to show first: the earliest required one that is not yet valid, else the review. */
export function firstOpenStep(form: WizardForm, ctx: RuleContext): StepKey {
  for (const step of STEPS) {
    if (step.key === 'review') break;
    if (
      Object.keys(stepErrors(step.key, form, ctx)).length > 0 &&
      (step.required || hasStarted(step.key, form))
    )
      return step.key;
  }
  return 'review';
}

function hasStarted(step: StepKey, form: WizardForm): boolean {
  return step === 'qualifications'
    ? form.qualifications.length > 0
    : step === 'experience'
      ? form.experience.length > 0
      : true;
}

/** A step can be opened once every step before it is valid (an optional step with nothing in it counts as valid). */
export function canOpen(target: StepKey, form: WizardForm, ctx: RuleContext): boolean {
  for (const step of STEPS) {
    if (step.key === target) return true;
    if (Object.keys(stepErrors(step.key, form, ctx)).length > 0) return false;
  }
  return false;
}

/** The steps a finished form still has trouble with, for the review. */
export function stepsWithErrors(form: WizardForm, ctx: RuleContext): StepKey[] {
  return STEPS.filter(
    (s) => s.key !== 'review' && Object.keys(stepErrors(s.key, form, ctx)).length > 0,
  ).map((s) => s.key);
}

// ── Draft ↔ form ───────────────────────────────────────────────────────────────────────────

/** `{ key: value }`, or nothing when there is no value: a draft leaves a blank field out rather than send it empty. */
const some = <K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> =>
  (value === undefined ? {} : { [key]: value }) as Partial<Record<K, string>>;

const text = (value: string): string | undefined => {
  const t = squash(value);
  return t === '' ? undefined : t;
};

function draftAddress(a: AddressForm) {
  const pincode = a.pincode.trim();
  return {
    ...some('line1', text(a.line1)),
    ...some('line2', text(a.line2)),
    ...some('district', text(a.district)),
    ...some('state', text(a.state)),
    ...(PINCODE.test(pincode) && { pincode }),
  };
}

/**
 * What a draft keeps. Blank fields are left out, and so is anything not yet well-formed (half a mobile number), so
 * "Save draft" works at any point instead of being refused for what you have not finished typing.
 */
export function toDraftData(
  form: WizardForm,
  orgCodes: readonly string[] = [],
): EmployeeDraftDataDto {
  const months = form.probationMonths.trim() === '' ? undefined : Number(form.probationMonths);
  const ctc = parseCtc(form.ctc);
  const mobile = form.mobileNumber.trim();
  const alternate = form.alternateMobile.trim();
  const esi = form.esiNumber.trim();
  const account = form.accountNumber.trim();
  const ifsc = form.ifsc.trim().toUpperCase();
  const { body: structure } = buildStructure(form.structure, orgCodes);

  return {
    personal: {
      ...some('name', text(form.name)),
      ...(MOBILE.test(mobile) && { mobileNumber: mobile }),
      ...(MOBILE.test(alternate) && { alternateMobile: alternate }),
      ...some('guardianName', text(form.guardianName)),
      ...(isRealDate(form.dateOfBirth) && { dateOfBirth: form.dateOfBirth }),
      ...(ESI.test(esi) && { esiNumber: esi }),
      ...(isRealDate(form.dateOfJoining) && { dateOfJoining: form.dateOfJoining }),
      ...(months !== undefined &&
        Number.isInteger(months) &&
        months >= 0 &&
        months <= 36 && { probationMonths: months }),
    },
    address: {
      present: draftAddress(form.present),
      permanent: draftAddress(form.permanent),
      permanentSameAsPresent: form.permanentSameAsPresent,
    },
    qualifications: form.qualifications.map((row) => {
      const year = Number(row.yearOfPassing);
      return {
        ...some('degree', text(row.degree)),
        ...some('institute', text(row.institute)),
        ...(Number.isInteger(year) && year >= 1950 && year <= 2100 && { yearOfPassing: year }),
      };
    }),
    experience: form.experience.map((row) => ({
      ...some('companyName', text(row.companyName)),
      ...(isRealDate(row.joiningDate) && { joiningDate: row.joiningDate }),
      ...(isRealDate(row.endDate) && { endDate: row.endDate }),
    })),
    bank: {
      ...some('bankName', text(form.bankName)),
      ...(ACCOUNT.test(account) && { accountNumber: account }),
      ...some('accountHolderName', text(form.accountHolderName)),
      ...(IFSC.test(ifsc) && { ifsc }),
      ...some('branchName', text(form.branchName)),
    },
    work: {
      ...(form.designationId && { designationId: form.designationId }),
      ...(form.hqId && { hqId: form.hqId }),
      ...(form.managerId && { managerId: form.managerId }),
    },
    compensation: {
      ...(form.payBandId && { payBandId: form.payBandId }),
      ...(ctc !== null && { ctcAnnualPaise: ctc }),
      ...(structure && { structure }),
    },
  };
}

const addressForm = (
  a:
    | { line1?: string; line2?: string; district?: string; state?: string; pincode?: string }
    | undefined,
): AddressForm => ({
  line1: a?.line1 ?? '',
  line2: a?.line2 ?? '',
  district: a?.district ?? '',
  state: a?.state ?? '',
  pincode: a?.pincode ?? '',
});

/** A saved draft back into the form. `zoneId` is not stored: the page works it out from the HQ. */
export function fromDraftData(data: EmployeeDraftDataDto): WizardForm {
  return {
    ...EMPTY_FORM,
    name: data.personal?.name ?? '',
    mobileNumber: data.personal?.mobileNumber ?? '',
    alternateMobile: data.personal?.alternateMobile ?? '',
    guardianName: data.personal?.guardianName ?? '',
    dateOfBirth: data.personal?.dateOfBirth ?? '',
    esiNumber: data.personal?.esiNumber ?? '',
    dateOfJoining: data.personal?.dateOfJoining ?? '',
    probationMonths:
      data.personal?.probationMonths === undefined ? '' : String(data.personal.probationMonths),
    present: addressForm(data.address?.present),
    permanent: addressForm(data.address?.permanent),
    permanentSameAsPresent: data.address?.permanentSameAsPresent ?? false,
    qualifications: (data.qualifications ?? []).map((q) => ({
      id: rowId(),
      degree: q.degree ?? '',
      institute: q.institute ?? '',
      yearOfPassing: q.yearOfPassing === undefined ? '' : String(q.yearOfPassing),
    })),
    experience: (data.experience ?? []).map((x) => ({
      id: rowId(),
      companyName: x.companyName ?? '',
      joiningDate: x.joiningDate ?? '',
      endDate: x.endDate ?? '',
    })),
    bankName: data.bank?.bankName ?? '',
    accountNumber: data.bank?.accountNumber ?? '',
    accountHolderName: data.bank?.accountHolderName ?? '',
    ifsc: data.bank?.ifsc ?? '',
    branchName: data.bank?.branchName ?? '',
    designationId: data.work?.designationId ?? '',
    hqId: data.work?.hqId ?? '',
    managerId: data.work?.managerId ?? '',
    payBandId: data.compensation?.payBandId ?? '',
    ctc:
      data.compensation?.ctcAnnualPaise === undefined
        ? ''
        : paiseToRupees(data.compensation.ctcAnnualPaise).replace(/\.00$/, ''),
    structure: structureToDraft(data.compensation?.structure),
  };
}

/** The wording shared in a message to the employee. */
export function credentialsMessage(name: string, employeeCode: string, password: string): string {
  return `Hi ${name}, your Greynote login is ready.\nEmployee ID: ${employeeCode}\nPassword: ${password}\nPlease keep it private.`;
}
