import type { SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import type { Paise } from '@/shared/money/paise.js';
import type { DoctorServiceType } from '../domain/serviceGift.entity.js';
import { recordHandler } from './callsSync.js';
import type { MarkGiftDoneUseCase, SubmitDoctorServiceUseCase } from './usecases/servicesAndGifts.usecase.js';

/** The record kinds for a Doctor Service request and a gift marked done (LLD sync.md, *The kinds registered so far*). */
export const DOCTOR_SERVICE_SYNC_KIND = 'DOCTOR_SERVICE';
export const GIFT_DONE_SYNC_KIND = 'GIFT_DONE';

export function makeServiceGiftSyncHandlers(deps: {
  service: SubmitDoctorServiceUseCase;
  gift: MarkGiftDoneUseCase;
  parse: {
    service: (p: unknown) => { doctorId: string; serviceType: DoctorServiceType; amountPaise: Paise; remarks: string | null };
    giftDone: (p: unknown) => { giftId: string };
  };
}): SyncHandlerDefinition[] {
  return [
    recordHandler(DOCTOR_SERVICE_SYNC_KIND, deps.parse.service, (rec, input, ctx) => deps.service.execute(rec, input, ctx)),
    recordHandler(GIFT_DONE_SYNC_KIND, deps.parse.giftDone, (rec, input, ctx) => deps.gift.execute(rec, input.giftId, ctx)),
  ];
}
