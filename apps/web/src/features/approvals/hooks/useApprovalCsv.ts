'use client';

import type { ApprovalDetailDto } from '@greynote/contracts';
import { resolveWorkWithLabels } from '@/features/planning/lib/workWithLabels';
import { doctorsCsv } from '@/features/field-master-data/lib/doctorsCsv';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { doctorsApi } from '@/lib/api/endpoints/fieldMasterData';
import { planningApi } from '@/lib/api/endpoints/planning';
import { salesApi } from '@/lib/api/endpoints/sales';
import { exportFilename, resolveExportOwner, slug } from '@/lib/exportFilename';
import { useCsvExport } from '@/lib/hooks/useCsvExport';
import { dailyPlanCsv } from '../lib/requestCsv/dailyPlanCsv';
import { dcrCsv } from '../lib/requestCsv/dcrCsv';
import { expenseMonthCsv } from '../lib/requestCsv/expenseMonthCsv';
import { secondarySalesCsv } from '../lib/requestCsv/secondarySalesCsv';

/** The kinds whose record is a table worth taking out. A leave or a doctor service is one record of a few fields. */
const CSV_KINDS = new Set(['DAILY_PLAN', 'DCR', 'EXPENSE_MONTH', 'SECONDARY_SALES', 'NEW_DOCTOR']);

type Request = Pick<ApprovalDetailDto, 'kind' | 'recordId' | 'status' | 'submitter'>;

/** Why a download is off for this request, or undefined when it is on. (A Tour Plan's Excel has its own button, `DownloadTourPlanButton`.) */
export function csvDisabledReason(_request: Pick<Request, 'kind' | 'status'>): string | undefined {
  return undefined;
}

/**
 * The approval page's "Download CSV": one file for the record the request is about, read with the same calls the preview makes.
 * `available` is false for a kind with no table (it shows no button); `disabledReason` is set while a rule keeps the file back.
 */
export function useApprovalCsv(request: Request) {
  const directory = useTerritoryDirectory();
  const submitterId = request.submitter?.id;
  const mutation = useCsvExport(async (token) => {
    const owner = submitterId ? await resolveExportOwner(token, submitterId) : {};
    const people = (ids: string[]) => resolveWorkWithLabels(token, ids);
    switch (request.kind) {
      case 'DAILY_PLAN': {
        const plan = await planningApi.daily(token, request.recordId);
        const label = await people(plan.workWith);
        const doctors = new Map(
          (await Promise.allSettled(plan.doctors.map((d) => doctorsApi.get(token, d.doctorId)))).flatMap((r) => (r.status === 'fulfilled' ? [[r.value.id, r.value.name] as const] : [])),
        );
        const csv = dailyPlanCsv(plan, { routeLabel: directory.routeLabel, personName: (id) => label.get(id) ?? '—', doctorName: (id) => doctors.get(id) ?? '—' });
        return { filename: exportFilename(owner, 'daily-plan', plan.planDate), csv };
      }
      case 'DCR': {
        const dcr = await fieldActivityApi.dcr(token, request.recordId);
        const label = await people(dcr.doctorCalls.flatMap((c) => c.workWith));
        return { filename: exportFilename(owner, 'dcr', dcr.reportDate), csv: dcrCsv(dcr, { routeLabel: directory.routeLabel, personName: (id) => label.get(id) ?? '—' }) };
      }
      case 'EXPENSE_MONTH': {
        const statement = await fieldActivityApi.expenseMonth(token, request.recordId);
        return { filename: exportFilename(owner, 'expenses', statement.month), csv: expenseMonthCsv(statement) };
      }
      case 'SECONDARY_SALES': {
        // An MR's report is `<userId>:<YYYY-MM>`, a manager's team report `<userId>:<YYYY-MM>:team`.
        const [userId = '', month = '', tail] = request.recordId.split(':');
        const report = tail === 'team' ? await salesApi.secondaryRollup(token, { userId, month }) : await salesApi.secondaryStock(token, { userId, month });
        return { filename: exportFilename(owner, tail === 'team' ? 'team-secondary' : 'secondary-sales', month), csv: secondarySalesCsv(report) };
      }
      case 'NEW_DOCTOR': {
        const doctor = await doctorsApi.get(token, request.recordId);
        return { filename: exportFilename(owner, 'doctor', slug(doctor.name)), csv: doctorsCsv([doctor], directory.routeLabel) };
      }
      default:
        throw new Error('This request has no table to download.');
    }
  });
  const disabledReason = csvDisabledReason(request);
  return { available: CSV_KINDS.has(request.kind), disabledReason, download: () => mutation.mutate(), isPending: mutation.isPending };
}
