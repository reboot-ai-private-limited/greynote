import { AppError } from '@/shared/errors/AppError.js';
import { SyncRejection, type SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import { STOCK_CODES, StockRefusal } from '../domain/stockRefusal.js';
import type { RecordMonthlyStockUseCase, RecordStockInput } from './usecases/recordMonthlyStock.usecase.js';

/** The record kind the phone sends for one outlet's monthly stock counts (LLD sync.md, *The kinds registered so far*). */
export const MONTHLY_STOCK_SYNC_KIND = 'MONTHLY_STOCK';

/** `parse` validates the payload with the same rules as the HTTP body and returns the use case's input. */
export function makeMonthlyStockSyncHandler(record: RecordMonthlyStockUseCase, parse: (payload: unknown) => RecordStockInput): SyncHandlerDefinition {
  return {
    kind: MONTHLY_STOCK_SYNC_KIND,
    async apply({ userId, payload }, ctx) {
      let input: RecordStockInput;
      try {
        input = parse(payload);
      } catch (err) {
        const issue = (err as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.[0];
        throw new SyncRejection(STOCK_CODES.invalidPayload, issue ? `${issue.path.join('.') || 'The record'}: ${issue.message}` : 'The record’s details are not valid.');
      }
      try {
        const { serverId } = await record.execute({ id: userId, role: 'FIELD' }, input, ctx);
        return { serverId };
      } catch (err) {
        if (err instanceof StockRefusal) throw new SyncRejection(err.code, err.message);
        // A month of a closed financial year takes no new counts: the phone is told so, not left retrying a server fault.
        if (err instanceof AppError && err.statusCode === 409 && (err.publicDetails as { code?: string } | undefined)?.code === 'FY_CLOSED') throw new SyncRejection('FY_CLOSED', err.message);
        throw err;
      }
    },
  };
}
