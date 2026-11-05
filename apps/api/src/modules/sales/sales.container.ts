import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { makeOrderSyncHandler } from './application/orderSync.js';
import { EditOrderUseCase, FinishOrderUseCase, GetOrderUseCase, ListOrdersUseCase, PlaceOrderUseCase, SetInvoiceNumberUseCase } from './application/usecases/orders.usecase.js';
import { GetInvoiceUseCase, ListInvoicesUseCase } from './application/usecases/invoices.usecase.js';
import { makeMonthlyStockSyncHandler } from './application/monthlyStockSync.js';
import { OutletAccess } from './application/outletAccess.js';
import type { SalesLateGate } from './domain/salesLateGate.port.js';
import { SalesClock } from './application/salesClock.js';
import { ListMissingStockUseCase, ListMonthlyStockUseCase } from './application/usecases/readMonthlyStock.usecase.js';
import { SECONDARY_SALES_KIND, parseSecondaryRecord } from './application/usecases/secondaryApproval.js';
import { DeleteSecondaryMonthUseCase } from './application/usecases/deleteSecondaryMonth.usecase.js';
import { monthStatusOf } from './application/usecases/secondarySummary.js';
import { ReadStatementUseCase, SaveStatementUseCase } from './application/usecases/stockStatement.usecase.js';
import { CancelPaymentUseCase, DistributorBalancesUseCase, ListPaymentsUseCase, OutstandingDuesUseCase, PaymentTotalsUseCase, RecordPaymentUseCase } from './application/usecases/payments.usecase.js';
import { RecordMonthlyStockUseCase } from './application/usecases/recordMonthlyStock.usecase.js';
import { UnlockMonthUseCase } from './application/usecases/unlockMonth.usecase.js';
import type { SalesApprovalsPort } from './domain/approvals.port.js';
import { monthTitle } from '@/modules/approval/approval.public.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import type { FieldMasterDataPort } from './domain/fieldMasterData.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoDistributorHistoryAdapter } from './infrastructure/mongoDistributorHistory.adapter.js';
import { MongoOrderAdapter } from './infrastructure/mongoOrder.adapter.js';
import { MongoEmployeeSaleAdapter } from './infrastructure/mongoEmployeeSale.adapter.js';
import { MongoStockStatementAdapter } from './infrastructure/mongoStockStatement.adapter.js';
import { MongoPaymentAdapter } from './infrastructure/mongoPayment.adapter.js';
import { MongoSecondaryAttachmentAdapter } from './infrastructure/mongoSecondaryAttachment.adapter.js';
import { CloudinarySecondaryFileStorage } from './infrastructure/cloudinarySecondaryFileStorage.adapter.js';
import { AddSecondaryAttachmentUseCase, RemoveSecondaryAttachmentUseCase } from './application/usecases/secondaryAttachments.usecase.js';
import { ReadSecondaryReportUseCase } from './application/usecases/secondaryReport.usecase.js';
import { MongoSecondaryStockLineAdapter } from './infrastructure/mongoSecondaryStockLine.adapter.js';
import { makeSecondaryRollupStatusHandler, ReadSecondaryRollupUseCase, SubmitSecondaryRollupUseCase } from './application/usecases/secondaryRollup.usecase.js';
import { MongoSecondaryRollupAdapter } from './infrastructure/mongoSecondaryRollup.adapter.js';
import { EditSecondaryStockUseCase, makeSecondaryStockStatusHandler, ReadSecondaryStockUseCase, SaveSecondaryStockUseCase, SubmitSecondaryStockUseCase } from './application/usecases/secondaryStock.usecase.js';
import type { MonthSecondaryStatus } from './domain/employeeSale.entity.js';
import { MongoMonthlyStockAdapter } from './infrastructure/mongoMonthlyStock.adapter.js';
import { makeSalesControllers } from './interface/sales.controller.js';
import { buildSalesRouter } from './interface/sales.route.js';
import { monthlyStockBodySchema, placeOrderBodySchema } from './interface/sales.schemas.js';
import type { SalesPublicContract } from './sales.public.js';

export interface SalesContainer {
  contract: SalesPublicContract;
  /** The month-end stock check — run by `scripts/run-stock-check.ts`, never by the server. `month` defaults to the month that just ended. */
  runStockCheck: (month?: string) => Promise<{ month: string; missing: Awaited<ReturnType<ListMissingStockUseCase['execute']>> }>;
  buildRouter: () => Router;
}

/**
 * Tier 4. Monthly stock and Orders (LLD sales-and-orders.md). Nothing here goes through the approval
 * module. Identity's, Field Master Data's, Sync's and Config's public contracts, passed in by the composition root.
 */
export function buildSalesContainer(users: UserDirectoryPort, master: FieldMasterDataPort, sync: SyncPublicContract, approvals: SalesApprovalsPort, config: ConfigReader, late?: SalesLateGate): SalesContainer {
  const stock = new MongoMonthlyStockAdapter();
  const orders = new MongoOrderAdapter();
  const payments = new MongoPaymentAdapter();
  const statements = new MongoStockStatementAdapter();
  const employeeSales = new MongoEmployeeSaleAdapter();
  const clock = new SalesClock(config);
  const secondaryFiles = new MongoSecondaryAttachmentAdapter();
  const secondaryLines = new MongoSecondaryStockLineAdapter();
  const secondaryRollups = new MongoSecondaryRollupAdapter();
  const attachmentDeps = { users, sales: employeeSales, stock, lines: secondaryLines, files: secondaryFiles, storage: new CloudinarySecondaryFileStorage(), clock, config, late };
  const distributorHistory = new MongoDistributorHistoryAdapter();

  const access = new OutletAccess(master);
  const record = new RecordMonthlyStockUseCase(access, master, stock, clock, config, late);
  const list = new ListMonthlyStockUseCase(stock, master, users);
  const missing = new ListMissingStockUseCase(stock, master, users);
  const unlock = new UnlockMonthUseCase(stock, clock);
  const place = new PlaceOrderUseCase(access, master, orders, clock, users);
  const getOrder = new GetOrderUseCase(orders, users);
  // One approval kind for secondary sales (decision-log 2026-11-05): an MR's month of per-distributor stock (`mrId:month`) and a manager's team report
  // (`managerId:month:team`). Both go to the submitter's manager (Admin may act in their place); only approved figures count toward achievement.
  const mrStatus = makeSecondaryStockStatusHandler(secondaryLines);
  const teamStatus = makeSecondaryRollupStatusHandler(secondaryRollups, () => clock.now());
  approvals.registerKind({
    kind: SECONDARY_SALES_KIND,
    finalApproverRoles: ['ADMIN'],
    managerOnly: true,
    describeRecords: async (ids) => new Map(ids.map((id) => [id, { title: `${monthTitle(id.split(':')[1] ?? '')}${parseSecondaryRecord(id)?.team ? ' · team report' : ''}`, subtitle: null }])),
    onStatusChange: async (change, ctx) => {
      await (parseSecondaryRecord(change.recordId)?.team ? teamStatus : mrStatus)(change, ctx);
    },
  });

  sync.registerHandler(
    makeMonthlyStockSyncHandler(record, (payload) => {
      const b = monthlyStockBodySchema.parse(payload);
      return { outlet: { type: b.outletType, id: b.outletId }, month: b.month, lines: b.lines };
    }),
  );

  sync.registerHandler(
    makeOrderSyncHandler(place, (payload) => {
      const b = placeOrderBodySchema.parse(payload);
      return { outlet: { type: b.outletType, id: b.outletId }, orderDate: b.orderDate, remarks: b.remarks, lines: b.lines };
    }),
  );

  return {
    contract: {
      sumOrderAmount: (filter) => orders.sumAmount(filter),
      listOrders: (f) => orders.list({ from: f.from, to: f.to, status: f.status, outlet: f.outlet, userIds: f.userId ? [f.userId] : undefined }, f.limit ?? 2000),
      sumDistributorOrders: async (f) => orders.sumDistributorOrders({ ...f, timeZone: await clock.timeZone(), dayStart: await clock.dayStart() }),
      listStockRange: (f) => stock.listRange(f, f.limit ?? 20000),
      listSecondaryLines: (f) => secondaryLines.listRange(f, f.limit ?? 50000),
      listSecondaryRollups: (f) => secondaryRollups.listRange(f, f.limit ?? 50000),
      sumUserOrders: async (f) => orders.sumUserOrders({ ...f, timeZone: await clock.timeZone(), dayStart: await clock.dayStart() }),
      // Achievement counts approved secondary only: a line still waiting, rejected or in draft reads as nothing entered.
      listEmployeeSales: async (f) => (await employeeSales.list(f, f.limit ?? 20000)).map((s) => (s.secondaryStatus === 'APPROVED' ? s : { ...s, secondaryQty: null, secondaryAmountPaise: null })),
      listStatements: (f) => statements.list(f, f.limit ?? 20000),
      getOrder: (id) => (id.match(/^[a-f\d]{24}$/i) ? orders.findById(id) : Promise.resolve(null)),
      listMissingStock: (month, userIds) => missing.execute({ id: 'system', role: 'ADMIN' }, month, userIds),
      countDistributorHistory: (id) => distributorHistory.count(id),
      eraseDistributorHistory: (id) => distributorHistory.erase(id),
      listSecondaryStatus: async (month, userIds) => {
        // Where each MR's month of per-distributor stock stands (2026-11-05); the older per-product entry is gone.
        const mine = userIds.length ? await secondaryLines.listRange({ fromMonth: month, toMonth: month, userIds, statuses: ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] }, 100000) : [];
        return userIds.map((userId) => {
          const own = mine.filter((r) => r.userId === userId);
          return { userId, status: monthStatusOf(own.map((r) => r.status)) as MonthSecondaryStatus };
        });
      },
    },
    runStockCheck: async (month) => {
      const m = month ?? (await clock.previousMonth());
      return { month: m, missing: await missing.execute({ id: 'system', role: 'ADMIN' }, m) };
    },
    buildRouter: () => buildSalesRouter(makeSalesControllers({ record, list, unlock, missing, place, listOrders: new ListOrdersUseCase(orders, users), getOrder, finish: new FinishOrderUseCase(getOrder, master, orders, clock), setInvoice: new SetInvoiceNumberUseCase(getOrder, master, orders), listInvoices: new ListInvoicesUseCase(orders, payments, master, clock), getInvoice: new GetInvoiceUseCase(orders, payments, master, clock), edit: new EditOrderUseCase(getOrder, master, orders, clock), recordPayment: new RecordPaymentUseCase(master, payments, orders, clock, config, users), listPayments: new ListPaymentsUseCase(payments, orders, users, master), cancelPayment: new CancelPaymentUseCase(payments, orders, clock, config, users), paymentTotals: new PaymentTotalsUseCase(payments), balances: new DistributorBalancesUseCase(payments, orders), outstanding: new OutstandingDuesUseCase(master, payments, orders), readStatement: new ReadStatementUseCase(master, statements, stock, orders, users, clock), saveStatement: new SaveStatementUseCase(master, statements, clock, config), secondaryReport: new ReadSecondaryReportUseCase(users, master, secondaryLines), saveSecondaryStock: new SaveSecondaryStockUseCase({ users, master, lines: secondaryLines, stock, clock, config, late }), editSecondaryStock: new EditSecondaryStockUseCase(users, secondaryLines, new MongooseTransactionRunner(), clock, config), submitSecondaryRollup: new SubmitSecondaryRollupUseCase(users, secondaryLines, secondaryRollups, approvals, new MongooseTransactionRunner(), clock, config), readSecondaryRollup: new ReadSecondaryRollupUseCase(users, master, secondaryLines, secondaryRollups, approvals), submitSecondaryStock: new SubmitSecondaryStockUseCase(users, secondaryLines, approvals, new MongooseTransactionRunner(), clock, config, secondaryFiles), readSecondaryStock: new ReadSecondaryStockUseCase(users, master, secondaryLines, orders, clock, secondaryFiles), deleteStockCounts: new DeleteSecondaryMonthUseCase(stock, approvals, new MongooseTransactionRunner(), clock, config, secondaryLines, secondaryRollups, secondaryFiles, attachmentDeps.storage), addSecondaryAttachment: new AddSecondaryAttachmentUseCase(attachmentDeps), removeSecondaryAttachment: new RemoveSecondaryAttachmentUseCase(attachmentDeps) })),
  };
}
