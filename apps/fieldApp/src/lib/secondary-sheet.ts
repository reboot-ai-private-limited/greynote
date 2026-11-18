import { apiGetFile } from './api';
import { deliverXlsx } from './csv';

/**
 * One employee's Secondary Sales performance sheet (Excel) for a financial year: products down the side, each month's target and approved secondary,
 * with quarters, halves and the year (a manager's is the sum of their MRs). The server builds it; `year` is the year the financial year starts in
 * and `label` ("2026-27") only names the file.
 */
export async function downloadSecondarySheet(person: { id: string; name: string }, year: number, label: string): Promise<string | null> {
  const bytes = await apiGetFile(`/reports/secondary-sheet?userId=${person.id}&year=${year}`);
  const name = person.name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return deliverXlsx(`GREYNOTE SECONDARY SALES ${label} ${name}.xlsx`, bytes, `${person.name} · Secondary sales ${label}`);
}
