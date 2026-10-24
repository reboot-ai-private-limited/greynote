'use client';

import type { ApprovalDetailDto } from '@greynote/contracts';
import { isDownloadable, monthlyPlanCsv, monthlyPlanFilename, notApprovedMessage } from '@/features/planning/lib/monthlyPlanCsv';
import { resolveWorkWithLabels } from '@/features/planning/lib/workWithLabels';
import { doctorsCsv } from '@/features/field-master-data/lib/doctorsCsv';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { doctorsApi } from '@/lib/api/endpoints/fieldMasterData';
import { planningApi } from '@/lib/api/endpoints/planning';
import { salesApi } from '@/lib/api/endpoints/sales';
import { useCsvExport } from '@/lib/hooks/useCsvExport';
import { dailyPlanCsv } from '../lib/requestCsv/dailyPlanCsv';
import { dcrCsv } from '../lib/requestCsv/dcrCsv';
import { expenseMonthCsv } from '../lib/requestCsv/expenseMonthCsv';
import { requestCsvFilename } from '../lib/requestCsv/filename';
import { secondarySalesCsv } from '../lib/requestCsv/secondarySalesCsv';

/** The kinds whose record is a table worth taking out. A leave or a doctor service is one record of a few fields. */
const CSV_KINDS = new Set(['MONTHLY_PLAN', 'DAILY_PLAN', 'DCR', 'EXPENSE_MONTH', 'SECONDARY_SALES', 'NEW_DOCTOR']);

type Request = Pick<ApprovalDetailDto, 'kind' | 'recordId' | 'status' | 'submitter'>;

/** Why a download is off for this request, or undefined when it is on. A monthly plan is handed out only once approved. */
export function csvDisabledReason(request: Pick<Request, 'kind' | 'status'>): string | undefined {
  return request.kind === 'MONTHLY_PLAN' && request.status !== 'APPROVED' ? 'Only an approved plan can be downloaded.' : undefined;
}

/**
 * The approval page's "Download CSV": one file for the record the request is about, read with the same calls the preview makes.
 * `available` is false for a kind with no table (it shows no button); `disabledReason` is set while a rule keeps the file back.
 */
export function useApprovalCsv(request: Request) {
  const directory = useTerritoryDirectory();
  const code = request.submitter?.employeeCode;
  const mutation = useCsvExport(async (token) => {
    const people = (ids: string[]) => resolveWorkWithLabels(token, ids);
    switch (request.kind) {
      case 'MONTHLY_PLAN': {
        const plan = await planningApi.monthly(token, request.recordId);
        if (!isDownloadable(plan.status)) throw new Error(notApprovedMessage(plan.planMonth));
        const label = await people(plan.entries.flatMap((e) => e.workWith));
        return { filename: monthlyPlanFilename(code ?? 'unknown', plan.planMonth), csv: monthlyPlanCsv(plan, { routeLabel: directory.routeLabel, personName: (id) => label.get(id) ?? '—' }) };
      }
      case 'DAILY_PLAN': {
        const plan = await planningApi.daily(token, request.recordId);
        const label = await people(plan.workWith);
        const doctors = new Map(
          (await Promise.allSettled(plan.doctors.map((d) => doctorsApi.get(token, d.doctorId)))).flatMap((r) => (r.status === 'fulfilled' ? [[r.value.id, r.value.name] as const] : [])),
        );
        const csv = dailyPlanCsv(plan, { routeLabel: directory.routeLabel, personName: (id) => label.get(id) ?? '—', doctorName: (id) => doctors.get(id) ?? '—' });
        return { filename: requestCsvFilename('daily-plan', code, plan.planDate), csv };
      }
      case 'DCR': {
        const dcr = await fieldActivityApi.dcr(token, request.recordId);
        const label = await people([...dcr.doctorCalls, ...dcr.chemistCalls].flatMap((c) => c.workWith));
        return { filename: requestCsvFilename('dcr', code, dcr.reportDate), csv: dcrCsv(dcr, { routeLabel: directory.routeLabel, personName: (id) => label.get(id) ?? '—' }) };
      }
      case 'EXPENSE_MONTH': {
        const statement = await fieldActivityApi.expenseMonth(token, request.recordId);
        return { filename: requestCsvFilename('expenses', code, statement.month), csv: expenseMonthCsv(statement) };
      }
      case 'SECONDARY_SALES': {
        // The record id is `<userId>:<YYYY-MM>`.
        const [userId = '', month = ''] = request.recordId.split(':');
        const sales = await salesApi.employeeSales(token, { userId, month });
        return { filename: requestCsvFilename('secondary', code, month), csv: secondarySalesCsv(sales) };
      }
      case 'NEW_DOCTOR': {
        const doctor = await doctorsApi.get(token, request.recordId);
        return { filename: requestCsvFilename('doctor', code, doctor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')), csv: doctorsCsv([doctor], directory.routeLabel) };
      }
      default:
        throw new Error('This request has no table to download.');
    }
  });
  const disabledReason = csvDisabledReason(request);
  return { available: CSV_KINDS.has(request.kind), disabledReason, download: () => mutation.mutate(), isPending: mutation.isPending };
}
