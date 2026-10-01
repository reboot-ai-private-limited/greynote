/** One row of `GET /sales/monthly-stock/missing` — one per MR with at least one outlet unreported. */
export interface MissingStockRowDto {
  userId: string;
  userName: string;
  outlets: { outletType: string; outletId: string; name: string }[];
}
