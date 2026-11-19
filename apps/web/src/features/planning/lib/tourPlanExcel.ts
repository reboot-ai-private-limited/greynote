import { reportsApi } from '@/lib/api/endpoints/reports';
import { downloadBlob } from '@/lib/download';
import { resolveExportOwner } from '@/lib/exportFilename';

/** Only an approved plan is handed out, on the phone and here (decision-log 2026-11-19). */
export const isDownloadable = (status: string): boolean => status === 'APPROVED' || status === 'MANAGER_APPROVED';

/** The Tour Plan Excel the server builds, the same file the phone downloads: saved as `GREYNOTE TOUR PLAN 2026-11 Name.xlsx`. */
export async function downloadTourPlanExcel(token: string, userId: string, month: string): Promise<void> {
  const [file, owner] = await Promise.all([reportsApi.tourPlan(token, { userId, month }), resolveExportOwner(token, userId)]);
  downloadBlob(`GREYNOTE TOUR PLAN ${month} ${owner.name ?? ''}.xlsx`.replace(/\s+\.xlsx$/, '.xlsx'), file);
}
