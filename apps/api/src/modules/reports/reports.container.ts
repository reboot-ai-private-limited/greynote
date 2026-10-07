import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { OrdersReport } from './application/ordersReport.js';
import { SalesReport } from './application/salesReport.js';
import { StockReport } from './application/stockReport.js';
import type { IdentityPort, MasterPort, SalesPort } from './domain/ports.js';
import { makeReportsControllers } from './interface/reports.controller.js';
import { buildReportsRouter } from './interface/reports.route.js';

export interface ReportsContainer {
  buildRouter: () => Router;
}

/**
 * Tier 7, the top of the graph. Read-only reports for the Admin (sign-off K24, K27, K28): orders now; the sales, stock, TA/DA, DCR and salary
 * reports as they are built. It owns no data and writes nothing. Identity's, Field Master Data's, Sales' and Config's public contracts,
 * passed in by the composition root.
 */
export function buildReportsContainer(identity: IdentityPort, master: MasterPort, sales: SalesPort, config: ConfigReader): ReportsContainer {
  const orders = new OrdersReport(sales, master, identity);
  const salesReport = new SalesReport(sales, master, config);
  const stockReport = new StockReport(sales, master);
  return { buildRouter: () => buildReportsRouter(makeReportsControllers(orders, salesReport, stockReport)) };
}
