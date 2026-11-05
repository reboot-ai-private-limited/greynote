import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import { StockRefusal } from '../domain/stockRefusal.js';
import type { ListMissingStockUseCase, ListMonthlyStockUseCase } from '../application/usecases/readMonthlyStock.usecase.js';
import type { Actor } from '../application/outletAccess.js';
import type { RecordMonthlyStockUseCase } from '../application/usecases/recordMonthlyStock.usecase.js';
import type { EditOrderUseCase, FinishOrderUseCase, GetOrderUseCase, ListOrdersUseCase, PlaceOrderUseCase, SetInvoiceNumberUseCase } from '../application/usecases/orders.usecase.js';
import type { GetInvoiceUseCase, ListInvoicesUseCase } from '../application/usecases/invoices.usecase.js';
import type { CancelPaymentUseCase, DistributorBalancesUseCase, ListPaymentsUseCase, OutstandingDuesUseCase, PaymentTotalsUseCase, RecordPaymentUseCase } from '../application/usecases/payments.usecase.js';
import type { ReadSecondaryReportUseCase } from '../application/usecases/secondaryReport.usecase.js';
import type { ReadSecondaryRollupUseCase, SubmitSecondaryRollupUseCase } from '../application/usecases/secondaryRollup.usecase.js';
import type { EditSecondaryStockUseCase, ReadSecondaryStockUseCase, SaveSecondaryStockUseCase, SubmitSecondaryStockUseCase } from '../application/usecases/secondaryStock.usecase.js';
import type { DeleteSecondaryMonthUseCase } from '../application/usecases/deleteSecondaryMonth.usecase.js';
import type { AddSecondaryAttachmentUseCase, RemoveSecondaryAttachmentUseCase } from '../application/usecases/secondaryAttachments.usecase.js';
import type { ReadStatementUseCase, SaveStatementUseCase } from '../application/usecases/stockStatement.usecase.js';
import type { UnlockMonthUseCase } from '../application/usecases/unlockMonth.usecase.js';
import type { secondaryReportQuerySchema, editSecondaryStockBodySchema, saveSecondaryStockBodySchema, submitStockCountsBodySchema, stockCountsQuerySchema, secondaryAttachmentBodySchema, cancelPaymentBodySchema, listMonthlyStockQuerySchema, listPaymentsQuerySchema, paymentTotalsQuerySchema, recordPaymentBodySchema, saveStatementBodySchema, statementQuerySchema, listOrdersQuerySchema, missingQuerySchema, monthlyStockBodySchema, placeOrderBodySchema, placeOrderForBodySchema, editOrderBodySchema, completeOrderBodySchema, listInvoicesQuerySchema, setInvoiceNumberBodySchema, unlockBodySchema } from './sales.schemas.js';

function actorOf(req: Request): Actor {
  if (!req.user) throw AppError.unauthenticated();
  return { id: req.user.sub, role: req.user.role };
}

/** A refusal keeps its own code in the details so a client can tell "closed" from "not yours" without parsing text. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!(err instanceof StockRefusal)) throw err;
    const details = { code: err.code };
    if (err.status === 403) throw AppError.forbidden(err.message);
    if (err.status === 404) throw AppError.notFound(err.message);
    if (err.status === 409) throw AppError.conflict(err.message, details);
    throw AppError.badRequest(err.message, details);
  }
}

export type SalesHandlers = Record<'recordStock' | 'listStock' | 'unlockMonth' | 'missingStock' | 'placeOrder' | 'placeOrderFor' | 'editOrder' | 'listOrders' | 'getOrder' | 'completeOrder' | 'setInvoiceNumber' | 'listInvoices' | 'getInvoice' | 'cancelOrder' | 'recordPayment' | 'listPayments' | 'paymentTotals' | 'distributorBalances' | 'distributorOutstanding' | 'cancelPayment' | 'readStatement' | 'saveStatement' | 'addSecondaryAttachment' | 'removeSecondaryAttachment' | 'secondaryReport' | 'saveSecondaryStock' | 'editSecondaryStock' | 'submitSecondaryRollup' | 'readSecondaryRollup' | 'submitSecondaryStock' | 'readSecondaryStock' | 'stockCountsImpact' | 'deleteStockCounts', RequestHandler>;

export function makeSalesControllers(u: {
  record: RecordMonthlyStockUseCase;
  list: ListMonthlyStockUseCase;
  unlock: UnlockMonthUseCase;
  missing: ListMissingStockUseCase;
  place: PlaceOrderUseCase;
  listOrders: ListOrdersUseCase;
  getOrder: GetOrderUseCase;
  finish: FinishOrderUseCase;
  setInvoice: SetInvoiceNumberUseCase;
  listInvoices: ListInvoicesUseCase;
  getInvoice: GetInvoiceUseCase;
  edit: EditOrderUseCase;
  recordPayment: RecordPaymentUseCase;
  listPayments: ListPaymentsUseCase;
  cancelPayment: CancelPaymentUseCase;
  paymentTotals: PaymentTotalsUseCase;
  balances: DistributorBalancesUseCase;
  outstanding: OutstandingDuesUseCase;
  readStatement: ReadStatementUseCase;
  saveStatement: SaveStatementUseCase;
  addSecondaryAttachment: AddSecondaryAttachmentUseCase;
  removeSecondaryAttachment: RemoveSecondaryAttachmentUseCase;
  secondaryReport: ReadSecondaryReportUseCase;
  saveSecondaryStock: SaveSecondaryStockUseCase;
  editSecondaryStock: EditSecondaryStockUseCase;
  submitSecondaryRollup: SubmitSecondaryRollupUseCase;
  readSecondaryRollup: ReadSecondaryRollupUseCase;
  submitSecondaryStock: SubmitSecondaryStockUseCase;
  readSecondaryStock: ReadSecondaryStockUseCase;
  deleteStockCounts: DeleteSecondaryMonthUseCase;
}): SalesHandlers {
  return {
    recordStock: asyncHandler(async (req, res) => {
      const b = req.body as z.output<typeof monthlyStockBodySchema>;
      const result = await refusing(() => u.record.execute(actorOf(req), { outlet: { type: b.outletType, id: b.outletId }, month: b.month, lines: b.lines }));
      sendSuccess(req, res, result, 'The stock counts were saved.', 200);
    }),
    listStock: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof listMonthlyStockQuerySchema>;
      const outlet = q.outletType && q.outletId ? { type: q.outletType, id: q.outletId } : undefined;
      sendSuccess(req, res, await u.list.execute(actorOf(req), { month: q.month, productId: q.productId, outlet }), 'Monthly stock counts.', 200);
    }),
    unlockMonth: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.unlock.execute(actorOf(req).id, (req.body as z.output<typeof unlockBodySchema>).month), 'The month is open for entry.', 200),
    ),
    missingStock: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.missing.execute(actorOf(req), (req.query as unknown as z.output<typeof missingQuerySchema>).month), 'Outlets with no stock count.', 200),
    ),
    placeOrder: asyncHandler(async (req, res) => {
      const b = req.body as z.output<typeof placeOrderBodySchema>;
      const result = await refusing(() => u.place.execute(actorOf(req), { outlet: { type: b.outletType, id: b.outletId }, orderDate: b.orderDate, remarks: b.remarks, lines: b.lines, discount: b.discount }));
      sendSuccess(req, res, result, 'The order was placed.', 201);
    }),
    placeOrderFor: asyncHandler(async (req, res) => {
      const b = req.body as z.output<typeof placeOrderForBodySchema>;
      const result = await refusing(() => u.place.executeFor(actorOf(req), b.userId, { outlet: { type: b.outletType, id: b.outletId }, orderDate: b.orderDate, remarks: b.remarks, lines: b.lines, discount: b.discount }));
      sendSuccess(req, res, result, 'The order was placed.', 201);
    }),
    editOrder: asyncHandler(async (req, res) => {
      const b = req.body as z.output<typeof editOrderBodySchema>;
      sendSuccess(req, res, await refusing(() => u.edit.execute(actorOf(req), requiredParam(req.params, 'id'), { remarks: b.remarks, lines: b.lines, discount: b.discount })), 'The order was changed.', 200);
    }),
    listOrders: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof listOrdersQuerySchema>;
      const outlet = q.outletType && q.outletId ? { type: q.outletType, id: q.outletId } : undefined;
      sendSuccess(req, res, await u.listOrders.execute(actorOf(req), { status: q.status, from: q.from, to: q.to, outlet }), 'Orders.', 200);
    }),
    getOrder: asyncHandler(async (req, res) => sendSuccess(req, res, await refusing(() => u.getOrder.execute(actorOf(req), requiredParam(req.params, 'id'))), 'The order.', 200)),
    recordPayment: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.recordPayment.execute(actorOf(req), req.body as z.output<typeof recordPaymentBodySchema>)), 'The payment was recorded.', 201),
    ),
    listPayments: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.listPayments.execute(req.query as unknown as z.output<typeof listPaymentsQuerySchema>)), 'Payments.', 200),
    ),
    distributorBalances: asyncHandler(async (req, res) => sendSuccess(req, res, await u.balances.execute(), 'What each distributor was delivered and paid.', 200)),
    distributorOutstanding: asyncHandler(async (req, res) => sendSuccess(req, res, await u.outstanding.execute(), 'What all distributors owe together.', 200)),
    paymentTotals: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await u.paymentTotals.execute(req.query as unknown as z.output<typeof paymentTotalsQuerySchema>), 'What each distributor paid.', 200),
    ),
    readStatement: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.readStatement.execute(req.query as unknown as z.output<typeof statementQuerySchema>)), 'The distributor\'s monthly statement.', 200),
    ),
    secondaryReport: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.secondaryReport.execute(actorOf(req), req.query as unknown as z.output<typeof secondaryReportQuerySchema>)), 'The approved secondary sales of the MRs below, by distributor and product.', 200),
    ),
    saveSecondaryStock: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.saveSecondaryStock.execute(actorOf(req), req.body as z.output<typeof saveSecondaryStockBodySchema>)), 'Saved as a draft.', 200),
    ),
    editSecondaryStock: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.editSecondaryStock.execute(actorOf(req), req.body as z.output<typeof editSecondaryStockBodySchema>)), 'The figures were corrected.', 200),
    ),
    submitSecondaryRollup: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.submitSecondaryRollup.execute(actorOf(req), (req.body as z.output<typeof submitStockCountsBodySchema>).month)), 'The team report was sent for approval.', 200),
    ),
    readSecondaryRollup: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.readSecondaryRollup.execute(actorOf(req), req.query as unknown as z.output<typeof stockCountsQuerySchema>)), 'The manager\'s team report for the month.', 200),
    ),
    submitSecondaryStock: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.submitSecondaryStock.execute(actorOf(req), (req.body as z.output<typeof submitStockCountsBodySchema>).month)), 'The month was sent for approval.', 200),
    ),
    readSecondaryStock: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.readSecondaryStock.execute(actorOf(req), req.query as unknown as z.output<typeof stockCountsQuerySchema>)), 'The MR\'s secondary stock for the month, by distributor and product.', 200),
    ),
    stockCountsImpact: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.deleteStockCounts.preview(actorOf(req), req.query as unknown as z.output<typeof stockCountsQuerySchema>)), 'What deleting the month would remove.', 200),
    ),
    deleteStockCounts: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.deleteStockCounts.execute(actorOf(req), req.query as unknown as z.output<typeof stockCountsQuerySchema>)), 'The month\'s distributor counts were deleted.', 200),
    ),
    addSecondaryAttachment: asyncHandler(async (req, res) => {
      if (!req.file) throw AppError.badRequest('A file is required.', { field: 'file' });
      const body = req.body as z.output<typeof secondaryAttachmentBodySchema>;
      const actor = actorOf(req);
      const file = await refusing(() => u.addSecondaryAttachment.execute(actor, { userId: body.userId ?? actor.id, month: body.month, file: { buffer: req.file!.buffer, name: req.file!.originalname } }));
      return sendSuccess(req, res, file, 'The file was attached.', 201);
    }),
    removeSecondaryAttachment: asyncHandler(async (req, res) => {
      await refusing(() => u.removeSecondaryAttachment.execute(actorOf(req), requiredParam(req.params, 'id')));
      return sendSuccess(req, res, null, 'The file was removed.', 200);
    }),
    saveStatement: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.saveStatement.execute(actorOf(req), req.body as z.output<typeof saveStatementBodySchema>)), 'The statement was saved.', 200),
    ),
    cancelPayment: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.cancelPayment.execute(actorOf(req), requiredParam(req.params, 'id'), (req.body as z.output<typeof cancelPaymentBodySchema>).reason)), 'The payment was cancelled.', 200),
    ),
    completeOrder: asyncHandler(async (req, res) => {
      const body = req.body as z.output<typeof completeOrderBodySchema>;
      return sendSuccess(req, res, await refusing(() => u.finish.execute(actorOf(req), requiredParam(req.params, 'id'), 'DONE', body.supply, body.invoiceNumber)), 'The order is done.', 200);
    }),
    listInvoices: asyncHandler(async (req, res) => sendSuccess(req, res, await refusing(() => u.listInvoices.execute(req.query as unknown as z.output<typeof listInvoicesQuerySchema>)), 'Invoices.', 200)),
    getInvoice: asyncHandler(async (req, res) => sendSuccess(req, res, await refusing(() => u.getInvoice.execute(requiredParam(req.params, 'id'))), 'The invoice.', 200)),
    setInvoiceNumber: asyncHandler(async (req, res) =>
      sendSuccess(req, res, await refusing(() => u.setInvoice.execute(actorOf(req), requiredParam(req.params, 'id'), (req.body as z.output<typeof setInvoiceNumberBodySchema>).invoiceNumber)), 'The invoice number was saved.', 200),
    ),
    cancelOrder: asyncHandler(async (req, res) => sendSuccess(req, res, await refusing(() => u.finish.execute(actorOf(req), requiredParam(req.params, 'id'), 'CANCELLED')), 'The order was cancelled.', 200)),
  };
}
