import { DOCTOR_SERVICE_TYPES, type AllocateGiftDto, type CreateAdminServiceDto, type DoctorServiceType } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import { rupeesToPaise } from '@/lib/money';

export const GIFT_NAME_MAX = 200;
export const REMARKS_MAX = 500;

/** A positive amount in rupees (`2500` or `2500.50`) as whole paise, or why not. */
function amount(raw: string): { paise: number | null; error?: string } {
  const text = raw.trim();
  if (text === '') return { paise: null, error: 'Enter the amount in rupees.' };
  const paise = rupeesToPaise(text);
  if (paise === null) return { paise: null, error: 'Enter an amount in rupees, like 2500 or 2500.50.' };
  return paise === 0 ? { paise: null, error: 'Must be more than 0.' } : { paise };
}

export interface ServiceDraft {
  doctorId: string;
  serviceType: string;
  amount: string;
  remarks: string;
}
export const EMPTY_SERVICE: ServiceDraft = { doctorId: '', serviceType: '', amount: '', remarks: '' };

const isServiceType = (v: string): v is DoctorServiceType => (DOCTOR_SERVICE_TYPES as readonly string[]).includes(v);

export function buildService(draft: ServiceDraft): BuildResult<CreateAdminServiceDto> {
  const money = amount(draft.amount);
  const remarks = squash(draft.remarks);
  const errors = {
    doctorId: draft.doctorId ? undefined : 'Choose the doctor.',
    serviceType: isServiceType(draft.serviceType) ? undefined : 'Choose the type of service.',
    amount: money.error,
    remarks: remarks.length > REMARKS_MAX ? `Keep the remarks to ${REMARKS_MAX} characters.` : undefined,
  };
  if (Object.values(errors).some(Boolean) || money.paise === null || !isServiceType(draft.serviceType)) return fail(errors);
  return { ok: true, body: { doctorId: draft.doctorId, serviceType: draft.serviceType, amountPaise: money.paise, remarks: remarks === '' ? null : remarks } };
}

export interface GiftDraft {
  doctorId: string;
  productName: string;
  amount: string;
}
export const EMPTY_GIFT: GiftDraft = { doctorId: '', productName: '', amount: '' };

export function buildGift(draft: GiftDraft): BuildResult<AllocateGiftDto> {
  const money = amount(draft.amount);
  const productName = squash(draft.productName);
  const errors = {
    doctorId: draft.doctorId ? undefined : 'Choose the doctor.',
    productName: productName === '' ? 'Name the gift.' : productName.length > GIFT_NAME_MAX ? `Keep the name to ${GIFT_NAME_MAX} characters.` : undefined,
    amount: money.error,
  };
  if (Object.values(errors).some(Boolean) || money.paise === null) return fail(errors);
  return { ok: true, body: { doctorId: draft.doctorId, productName, amountPaise: money.paise } };
}
