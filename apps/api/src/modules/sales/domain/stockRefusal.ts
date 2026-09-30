export const STOCK_CODES = {
  invalidPayload: 'INVALID_PAYLOAD',
  outletNotFound: 'OUTLET_NOT_FOUND',
  outletNotYours: 'OUTLET_NOT_YOURS',
  productNotFound: 'PRODUCT_NOT_FOUND',
  monthNotStarted: 'MONTH_NOT_STARTED',
  monthClosed: 'MONTH_CLOSED',
  orderNotFound: 'ORDER_NOT_FOUND',
  orderNotYours: 'ORDER_NOT_YOURS',
  orderNotPlaced: 'ORDER_NOT_PLACED',
  orderDateInFuture: 'ORDER_DATE_IN_FUTURE',
  amountTooLarge: 'AMOUNT_TOO_LARGE',
} as const;
export type StockCode = (typeof STOCK_CODES)[keyof typeof STOCK_CODES];

const STATUS: Record<StockCode, number> = { INVALID_PAYLOAD: 400, OUTLET_NOT_FOUND: 404, OUTLET_NOT_YOURS: 403, PRODUCT_NOT_FOUND: 404, MONTH_NOT_STARTED: 409, MONTH_CLOSED: 409, ORDER_NOT_FOUND: 404, ORDER_NOT_YOURS: 403, ORDER_NOT_PLACED: 409, ORDER_DATE_IN_FUTURE: 400, AMOUNT_TOO_LARGE: 400 };

/** A stock or order entry refused for what it refers to or when it arrives. A plain domain error: HTTP maps it to a status, sync to a record reason. */
export class StockRefusal extends Error {
  constructor(
    readonly code: StockCode,
    message: string,
  ) {
    super(message);
    this.name = 'StockRefusal';
  }
  get status(): number {
    return STATUS[this.code];
  }
}
