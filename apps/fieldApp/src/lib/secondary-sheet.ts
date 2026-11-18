import { apiGetFile } from './api';
import { deliverXlsx } from './csv';

/**
 * The Secondary Sales performance sheet (Excel) for the financial year the app is showing: a sheet per MR of the manager's team and a roll-up per
 * manager, targets and approved secondary by product and month, with quarters, halves and the year. The server builds it (a manager gets their own
 * team); `fyLabel` is only the file name ("2026-27").
 */
export async function downloadSecondarySheet(fyLabel: string): Promise<string | null> {
  const bytes = await apiGetFile('/reports/secondary-sheet');
  return deliverXlsx(`GREYNOTE SECONDARY SALES ${fyLabel}.xlsx`, bytes, `Secondary sales ${fyLabel}`);
}
