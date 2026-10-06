import type { CreateLeaveTypeDto, LeaveTypeDto, UpdateLeaveTypeDto } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';

export const NAME_MAX = 100;

/** `''` is "not chosen": paid or unpaid decides whether the type has a balance, so Admin says. */
export type PaidChoice = '' | 'paid' | 'unpaid';

export interface LeaveTypeDraft {
  name: string;
  paid: PaidChoice;
  /** The employee may attach proof (a prescription, a certificate) to a leave of this type. */
  allowsProof: boolean;
}

export const EMPTY_LEAVE_TYPE: LeaveTypeDraft = { name: '', paid: '', allowsProof: false };

export function leaveTypeToDraft(type: LeaveTypeDto): LeaveTypeDraft {
  return { name: type.name, paid: type.isPaid ? 'paid' : 'unpaid', allowsProof: type.allowsProof };
}

function errorsFor(draft: LeaveTypeDraft) {
  const name = squash(draft.name);
  return {
    name: name === '' ? 'Enter a name.' : name.length > NAME_MAX ? `Keep the name to ${NAME_MAX} characters.` : undefined,
    paid: draft.paid === '' ? 'Choose paid or unpaid.' : undefined,
  };
}

export function buildLeaveType(draft: LeaveTypeDraft): BuildResult<CreateLeaveTypeDto> {
  const errors = errorsFor(draft);
  return errors.name || errors.paid ? fail(errors) : { ok: true, body: { name: squash(draft.name), isPaid: draft.paid === 'paid', allowsProof: draft.allowsProof } };
}

/** Only what changed. Changing paid or unpaid is sent too: the server refuses it once the type is in use, and says so. */
export function buildLeaveTypeUpdate(original: LeaveTypeDto, draft: LeaveTypeDraft): BuildResult<UpdateLeaveTypeDto> {
  const errors = errorsFor(draft);
  if (errors.name || errors.paid) return fail(errors);
  const name = squash(draft.name);
  const isPaid = draft.paid === 'paid';
  return {
    ok: true,
    body: { ...(name !== original.name && { name }), ...(isPaid !== original.isPaid && { isPaid }), ...(draft.allowsProof !== original.allowsProof && { allowsProof: draft.allowsProof }) },
  };
}

/** An unpaid type has no balance and feeds the pay deduction; a paid one is drawn from a balance. */
export function paidLabel(isPaid: boolean): string {
  return isPaid ? 'Paid' : 'Unpaid';
}

/** The Leave Master has a column only for paid types, since an unpaid one has no balance to set. */
export function paidTypes<T extends Pick<LeaveTypeDto, 'isPaid' | 'active'>>(types: readonly T[]): T[] {
  return types.filter((t) => t.isPaid && t.active);
}
