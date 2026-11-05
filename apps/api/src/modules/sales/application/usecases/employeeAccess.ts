import type { ConfigReader } from '@/shared/config/readConfig.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { SalesLateGate } from '../../domain/salesLateGate.port.js';
import { monthWindow } from '../../domain/stockDeadline.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';

/**
 * Whose figures the actor may touch: Admin anyone's; a field employee their own and, as a manager, their downline's. The subject must be an
 * active field employee.
 */
export async function assertMayAct(users: UserDirectoryPort, actor: Actor, userId: string): Promise<void> {
  const [subject] = await users.getUserSummaries([userId]);
  if (!subject || subject.status !== 'active' || subject.role !== 'FIELD') throw new StockRefusal(STOCK_CODES.employeeNotFound, 'That employee does not exist or is not an active field employee.');
  if (actor.role === 'ADMIN' || actor.id === userId) return;
  const downline = actor.role === 'FIELD' ? await users.getDownline(actor.id) : [];
  if (!downline.some((u) => u.id === userId)) throw new StockRefusal(STOCK_CODES.notYourTeam, 'You can only work with your own figures and your team\'s.');
}

/**
 * The month must have started, its financial year be open, and (for anyone but Admin) its stock deadline not have passed unless Admin reopened
 * it. The one window every entry of a month's secondary obeys: the figures and their files.
 */
export async function assertMonthOpenForEntry(deps: { clock: SalesClock; stock: MonthlyStockRepositoryPort; config: ConfigReader; late?: SalesLateGate | undefined }, actor: Actor, month: string, subjectUserId: string): Promise<void> {
  const window = monthWindow(month, deps.clock.now(), await deps.clock.deadlineDay(), await deps.clock.timeZone(), await deps.clock.dayStart());
  if (window === 'FUTURE') throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
  if (window === 'CLOSED' && actor.role !== 'ADMIN' && !(await deps.stock.isUnlocked(month)) && !(await deps.late?.hasUsable(subjectUserId, 'SECONDARY_SALES', month))) {
    throw new StockRefusal(STOCK_CODES.monthClosed, `The deadline for ${month} has passed. Ask an Admin to reopen it.`);
  }
  await assertFinancialYearOpen(deps.config, `${month}-01`, 'This month');
}
