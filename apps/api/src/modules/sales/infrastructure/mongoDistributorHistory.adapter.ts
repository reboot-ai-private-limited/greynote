import { Types } from 'mongoose';
import type { DistributorHistory, DistributorHistoryPort } from '../domain/distributorHistory.port.js';
import { MonthlyStockModel } from './monthlyStock.schema.js';
import { OrderModel } from './order.schema.js';
import { PaymentModel } from './payment.schema.js';
import { StockStatementModel } from './stockStatement.schema.js';

export class MongoDistributorHistoryAdapter implements DistributorHistoryPort {
  async count(distributorId: string): Promise<DistributorHistory> {
    if (!Types.ObjectId.isValid(distributorId)) return { payments: 0, orders: 0, openOrders: 0, monthlyStock: 0, stockStatements: 0 };
    const filter = { distributorId: new Types.ObjectId(distributorId) };
    const [payments, orders, openOrders, monthlyStock, stockStatements] = await Promise.all([
      PaymentModel.countDocuments(filter),
      OrderModel.countDocuments(filter),
      OrderModel.countDocuments({ ...filter, status: 'PLACED' }),
      MonthlyStockModel.countDocuments(filter),
      StockStatementModel.countDocuments(filter),
    ]);
    return { payments, orders, openOrders, monthlyStock, stockStatements };
  }

  async erase(distributorId: string): Promise<DistributorHistory> {
    const before = await this.count(distributorId);
    if (!Types.ObjectId.isValid(distributorId)) return before;
    const filter = { distributorId: new Types.ObjectId(distributorId) };
    await Promise.all([PaymentModel.deleteMany(filter), OrderModel.deleteMany(filter), MonthlyStockModel.deleteMany(filter), StockStatementModel.deleteMany(filter)]);
    return before;
  }
}
