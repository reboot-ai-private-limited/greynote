import { SecondaryReportScreen } from '@/components/secondary-report-screen';
import { SecondaryStockScreen } from '@/components/secondary-stock-screen';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * Secondary Sales (docs/mobile/secondary-and-targets.md, 2026-11-05). An MR enters units per assigned distributor and product,
 * attaches a proof file and submits the month; a manager sees no entry controls, only their team's approved figures.
 */
export default function SecondarySalesScreen() {
  const { isManager } = useCurrentUser();
  return isManager ? <SecondaryReportScreen /> : <SecondaryStockScreen />;
}
