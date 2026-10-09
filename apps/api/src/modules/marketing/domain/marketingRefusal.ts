export const MARKETING_CODES = {
  productNotFound: 'PRODUCT_NOT_FOUND',
  campaignNotFound: 'CAMPAIGN_NOT_FOUND',
  visualNotFound: 'VISUAL_NOT_FOUND',
  userNotFound: 'USER_NOT_FOUND',
  notYourTeam: 'NOT_YOUR_TEAM',
  invalidDates: 'INVALID_DATES',
  unsupportedFile: 'UNSUPPORTED_FILE',
  outsideFinancialYear: 'OUTSIDE_FINANCIAL_YEAR',
} as const;
export type MarketingCode = (typeof MARKETING_CODES)[keyof typeof MARKETING_CODES];

const STATUS: Record<MarketingCode, number> = { PRODUCT_NOT_FOUND: 404, CAMPAIGN_NOT_FOUND: 404, VISUAL_NOT_FOUND: 404, USER_NOT_FOUND: 404, NOT_YOUR_TEAM: 403, INVALID_DATES: 400, UNSUPPORTED_FILE: 400, OUTSIDE_FINANCIAL_YEAR: 400 };

/** A write refused for what it refers to. A plain domain error; the controller maps it to a status. */
export class MarketingRefusal extends Error {
  constructor(
    readonly code: MarketingCode,
    message: string,
  ) {
    super(message);
    this.name = 'MarketingRefusal';
  }
  get status(): number {
    return STATUS[this.code];
  }
}
