import { SyncRejection, type SyncHandlerDefinition } from '@/modules/sync/sync.public.js';
import { STOCK_CODES, StockRefusal } from '../domain/stockRefusal.js';
import type { PlaceOrderInput, PlaceOrderUseCase } from './usecases/orders.usecase.js';

/** The record kind the phone sends for an order (LLD sync.md, *The kinds registered so far*). Completing or cancelling one needs a connection. */
export const ORDER_SYNC_KIND = 'ORDER';

/** `parse` validates the payload with the same rules as the HTTP body. The server's totals go back in `data` (sign-off G10). */
export function makeOrderSyncHandler(place: PlaceOrderUseCase, parse: (payload: unknown) => PlaceOrderInput): SyncHandlerDefinition {
  return {
    kind: ORDER_SYNC_KIND,
    async apply({ userId, clientId, payload }, ctx) {
      let input: PlaceOrderInput;
      try {
        input = parse(payload);
      } catch (err) {
        const issue = (err as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues?.[0];
        throw new SyncRejection(STOCK_CODES.invalidPayload, issue ? `${issue.path.join('.') || 'The record'}: ${issue.message}` : 'The record’s details are not valid.');
      }
      try {
        const { serverId, totalAmountPaise } = await place.execute({ id: userId, role: 'FIELD' }, input, clientId, ctx);
        return { serverId, data: { totalAmountPaise } };
      } catch (err) {
        throw err instanceof StockRefusal ? new SyncRejection(err.code, err.message) : err;
      }
    },
  };
}
