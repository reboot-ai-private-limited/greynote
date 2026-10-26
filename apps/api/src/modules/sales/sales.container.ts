import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { makeOrderSyncHandler } from './application/orderSync.js';
import { EditOrderUseCase, FinishOrderUseCase, GetOrderUseCase, ListOrdersUseCase, PlaceOrderUseCase } from './application/usecases/orders.usecase.js';
import { makeMonthlyStockSyncHandler } from './application/monthlyStockSync.js';
import { OutletAccess } from './application/outletAccess.js';
import { SalesClock } from './application/salesClock.js';
import { ListMissingStockUseCase, ListMonthlyStockUseCase } from './application/usecases/readMonthlyStock.usecase.js';
import { makeSecondaryStatusHandler, ReadEmployeeSalesUseCase, SaveEmployeePrimaryUseCase, SaveEmployeeSecondaryUseCase, SECONDARY_SALES_KIND, SubmitEmployeeSecondaryUseCase } from './application/usecases/employeeSales.usecase.js';
import { monthSecondaryStatus } from './domain/employeeSale.entity.js';
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
export function buildSalesContainer(users: UserDirectoryPort, master: FieldMasterDataPort, sync: SyncPublicContract, approvals: SalesApprovalsPort, config: ConfigReader): SalesContainer {
  const stock = new MongoMonthlyStockAdapter();
  const orders = new MongoOrderAdapter();
  const payments = new MongoPaymentAdapter();
  const statements = new MongoStockStatementAdapter();
  const employeeSales = new MongoEmployeeSaleAdapter();
  const clock = new SalesClock(config);
  const distributorHistory = new MongoDistributorHistoryAdapter();

  const access = new OutletAccess(master);
  const record = new RecordMonthlyStockUseCase(access, master, stock, clock, config);
  const list = new ListMonthlyStockUseCase(stock, master, users);
  const missing = new ListMissingStockUseCase(stock, master, users);
  const unlock = new UnlockMonthUseCase(stock, clock);
  const place = new PlaceOrderUseCase(access, master, orders, clock, users);
  const getOrder = new GetOrderUseCase(orders, users);
  // A month's secondary is approved by the employee's manager (Admin may act in their place); only approved lines count toward achievement.
  approvals.registerKind({ kind: SECONDARY_SALES_KIND, finalApproverRoles: ['ADMIN'], managerOnly: true, describeRecords: async (ids) => new Map(ids.map((id) => [id, { title: monthTitle(id.split(':')[1] ?? ''), subtitle: null }])), onStatusChange: makeSecondaryStatusHandler(employeeSales) });

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
      sumUserOrders: async (f) => orders.sumUserOrders({ ...f, timeZone: await clock.timeZone(), dayStart: await clock.dayStart() }),
      // Achievement counts approved secondary only: a line still waiting, rejected or in draft reads as nothing entered.
      listEmployeeSales: async (f) => (await employeeSales.list(f, f.limit ?? 20000)).map((s) => (s.secondaryStatus === 'APPROVED' ? s : { ...s, secondaryQty: null, secondaryAmountPaise: null })),
      listStatements: (f) => statements.list(f, f.limit ?? 20000),
      getOrder: (id) => (id.match(/^[a-f\d]{24}$/i) ? orders.findById(id) : Promise.resolve(null)),
      listMissingStock: (month, userIds) => missing.execute({ id: 'system', role: 'ADMIN' }, month, userIds),
      countDistributorHistory: (id) => distributorHistory.count(id),
      eraseDistributorHistory: (id) => distributorHistory.erase(id),
      listSecondaryStatus: async (month, userIds) => {
        const rows = userIds.length ? await employeeSales.list({ fromMonth: month, toMonth: month, userIds }, 20000) : [];
        return userIds.map((userId) => ({ userId, status: monthSecondaryStatus(rows.filter((r) => r.userId === userId)) }));
      },
    },
    runStockCheck: async (month) => {
      const m = month ?? (await clock.previousMonth());
      return { month: m, missing: await missing.execute({ id: 'system', role: 'ADMIN' }, m) };
    },
    buildRouter: () => buildSalesRouter(makeSalesControllers({ record, list, unlock, missing, place, listOrders: new ListOrdersUseCase(orders, users), getOrder, finish: new FinishOrderUseCase(getOrder, orders, clock), edit: new EditOrderUseCase(getOrder, master, orders, clock), recordPayment: new RecordPaymentUseCase(master, payments, clock, config, users), listPayments: new ListPaymentsUseCase(payments, orders, users, master), cancelPayment: new CancelPaymentUseCase(payments, clock, config, users), paymentTotals: new PaymentTotalsUseCase(payments), balances: new DistributorBalancesUseCase(payments, orders), outstanding: new OutstandingDuesUseCase(master, payments, orders), readStatement: new ReadStatementUseCase(master, statements, stock, orders, users, clock), saveStatement: new SaveStatementUseCase(master, statements, clock, config), readEmployeeSales: new ReadEmployeeSalesUseCase(users, master, employeeSales, orders, clock, approvals), submitEmployeeSecondary: new SubmitEmployeeSecondaryUseCase(employeeSales, approvals, new MongooseTransactionRunner(), clock, config), saveEmployeeSecondary: new SaveEmployeeSecondaryUseCase(users, master, employeeSales, stock, clock, config), saveEmployeePrimary: new SaveEmployeePrimaryUseCase(users, master, employeeSales, clock, config) })),
  };
}
