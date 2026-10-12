import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { DcrClock } from './application/dcrClock.js';
import { makeDcrSubmitSyncHandler } from './application/dcrSubmitSync.js';
import { DCR_KIND } from './application/dcrStatus.js';
import { DcrViews } from './application/dcrViews.js';
import { HasQualifyingDcrUseCase, ListReportedDatesUseCase } from './application/usecases/hasQualifyingDcr.usecase.js';
import { CallChecks } from './application/callChecks.js';
import { makeCallSyncHandlers } from './application/callsSync.js';
import { makeExpenseSyncHandler } from './application/expenseSync.js';
import { TaDaLifecycle } from './application/usecases/taDaLifecycle.usecase.js';
import { EXPENSE_MONTH_KIND, ExpenseMonthService } from './application/usecases/expenseMonth.usecase.js';
import { ExpenseMonthDeadlines } from './application/expenseMonthDeadlines.js';
import { GrantExpenseMonthUseCase, ListExpenseMonthGrantsUseCase, RevokeExpenseMonthGrantUseCase } from './application/usecases/expenseMonthGrants.usecase.js';
import { MongoExpenseMonthGrantAdapter } from './infrastructure/mongoExpenseMonthGrant.adapter.js';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { LogExpenseUseCase } from './application/usecases/logExpense.usecase.js';
import { makeServiceGiftSyncHandlers } from './application/serviceGiftSync.js';
import { makeFieldActivitySource } from './application/fieldActivitySnapshot.js';
import { ListExpensePayoutsUseCase, PayMonthExpensesUseCase } from './application/usecases/expensePayouts.usecase.js';
import { GetPaidTaDaTotalUseCase, ListExpensesUseCase, MarkExpensePaidUseCase } from './application/usecases/accountantExpenses.usecase.js';
import { RunMissedDcrCheckUseCase } from './application/usecases/runMissedDcrCheck.usecase.js';
import type { LeavePort } from './domain/leave.port.js';
import { CountDoctorCallsUseCase, ListCalledDoctorsUseCase, SummarizeDcrsUseCase } from './application/usecases/dcrReports.usecase.js';
import { GetDcrSummaryUseCase } from './application/usecases/getDcrSummary.usecase.js';
import { AllocateGiftUseCase, CreateAdminDoctorServiceUseCase, DOCTOR_SERVICE_KIND, GetDoctorServiceUseCase, MarkDoctorServiceDoneUseCase, ListDoctorServicesUseCase, ListGiftsUseCase, MarkGiftDoneUseCase, SubmitDoctorServiceUseCase } from './application/usecases/servicesAndGifts.usecase.js';
import { GeofenceEvaluator } from './application/geofenceEvaluator.js';
import { LoggingGate } from './application/loggingGate.js';
import { OverrideGeofenceUseCase } from './application/usecases/overrideGeofence.usecase.js';
import { GetDcrDetailUseCase } from './application/usecases/getDcrDetail.usecase.js';
import { LogChemistCallUseCase, LogDoctorCallUseCase, LogFollowupUseCase } from './application/usecases/logCalls.usecase.js';
import { GetDcrUseCase, ListAllDcrsUseCase, ListMyDcrsUseCase, ListTeamDcrsUseCase } from './application/usecases/readDcrs.usecase.js';
import { DeleteDcrRecordUseCase } from './application/usecases/deleteDcrRecord.usecase.js';
import { SubmitDcrUseCase } from './application/usecases/submitDcr.usecase.js';
import type { ApprovalsPort } from './domain/approvals.port.js';
import type { FieldMasterDataPort } from './domain/fieldMasterData.port.js';
import type { PlanningPort } from './domain/planning.port.js';
import type { TerritoryPort } from './domain/territory.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import type { FieldActivityPublicContract } from './field-activity.public.js';
import { MongoDoctorGiftAdapter, MongoDoctorServiceAdapter } from './infrastructure/mongoServiceGift.adapter.js';
import { CloudinaryProofStorage } from './infrastructure/cloudinaryProofStorage.adapter.js';
import { ExpenseProof } from './application/expenseProof.js';
import { MongoDcrAdapter } from './infrastructure/mongoDcr.adapter.js';
import { MongoChemistCallAdapter, MongoDoctorCallAdapter, MongoExpenseAdapter, MongoExpenseMonthAdapter, MongoFollowupAdapter } from './infrastructure/mongoRecords.adapter.js';
import { makeFieldActivityControllers } from './interface/field-activity.controller.js';
import { buildFieldActivityRouter } from './interface/field-activity.route.js';
import {
  chemistCallPayloadSchema,
  chemistFollowupPayloadSchema,
  dcrSubmitPayloadSchema,
  doctorCallPayloadSchema,
  doctorFollowupPayloadSchema,
  doctorServicePayloadSchema,
  expensePayloadSchema,
  giftDonePayloadSchema,
} from './interface/field-activity.schemas.js';

export interface FieldActivityContainer {
  contract: FieldActivityPublicContract;
  /** The missed-DCR compliance job — run by `scripts/run-compliance.ts`, never by the server. */
  runMissedDcrCheck: (options?: { dryRun?: boolean; userIds?: string[] }) => ReturnType<RunMissedDcrCheckUseCase['execute']>;
  buildRouter: () => Router;
}

/**
 * Tier 4. Built up over Phase 6 (docs/roadmap.md): the DCR and its gate (here), calls and follow-ups,
 * expenses, the rest of the sync record kinds, DCR review, TA/DA, Doctor Service and Gift, mark-paid, and the
 * missed-DCR job. Records reach the server through the sync push (LLD sync.md), so this module registers
 * handlers there rather than exposing a POST per record.
 *
 * Identity's, Planning's, Field Master Data's, Territory's, Approval's, Sync's, HR's and Config's public contracts,
 * passed in by the composition root.
 */
export function buildFieldActivityContainer(
  users: UserDirectoryPort,
  planning: PlanningPort,
  master: FieldMasterDataPort,
  territory: TerritoryPort,
  approvals: ApprovalsPort,
  sync: SyncPublicContract,
  leave: LeavePort,
  config: ConfigReader,
): FieldActivityContainer {
  // 1. Adapters
  const dcrs = new MongoDcrAdapter();
  const doctorCalls = new MongoDoctorCallAdapter();
  const chemistCalls = new MongoChemistCallAdapter();
  const followups = new MongoFollowupAdapter();
  const expenses = new MongoExpenseAdapter();
  const expenseMonths = new MongoExpenseMonthAdapter();
  const services = new MongoDoctorServiceAdapter();
  const gifts = new MongoDoctorGiftAdapter();

  // A DCR goes manager, then Admin (client F1). Past the manager it earns its TA/DA; sent back, the unpaid computed rows are cancelled.
  const taDa = new TaDaLifecycle(dcrs, planning, territory, users, expenses, config);
  approvals.registerKind({ kind: DCR_KIND, finalApproverRoles: ['ADMIN'], onStatusChange: (change, ctx) => taDa.onStatusChange(change.recordId, change.status, ctx) });

  // A Service an MR asks for goes manager, then Admin, like a DCR; nothing else happens on approval — the status is its request's.
  approvals.registerKind({ kind: DOCTOR_SERVICE_KIND, finalApproverRoles: ['ADMIN'] });

  // 2. Use cases
  const clock = new DcrClock(config);

  // A month of expenses goes to the manager, whose approval is the decision (Admin may act in their place); approval makes its rows payable.
  const proofStorage = new CloudinaryProofStorage();
  const expenseGrants = new MongoExpenseMonthGrantAdapter();
  const monthService = new ExpenseMonthService(expenses, expenseMonths, users, approvals, clock, config, new MongooseTransactionRunner(), proofStorage, expenseGrants, new ExpenseMonthDeadlines(config));
  approvals.registerKind({ kind: EXPENSE_MONTH_KIND, finalApproverRoles: ['ADMIN'], managerOnly: true, onStatusChange: (change, ctx) => monthService.onStatusChange(change.recordId, change.status, ctx) });
  const gate = new LoggingGate(users, planning, approvals, dcrs, clock);
  const views = new DcrViews(approvals);
  const submitDcr = new SubmitDcrUseCase(gate, dcrs, approvals, taDa, config, planning);
  const hasQualifyingDcr = new HasQualifyingDcrUseCase(dcrs, approvals);
  const listReportedDates = new ListReportedDatesUseCase(dcrs, approvals);
  const summarizeDcrs = new SummarizeDcrsUseCase(dcrs, approvals, doctorCalls, chemistCalls, followups, clock);
  const listCalledDoctors = new ListCalledDoctorsUseCase(dcrs, approvals, doctorCalls);
  const countDoctorCalls = new CountDoctorCallsUseCase(dcrs, approvals, doctorCalls);
  const paidTaDa = new GetPaidTaDaTotalUseCase(expenses, clock);
  const dcrSummary = new GetDcrSummaryUseCase(dcrs, views, doctorCalls, chemistCalls, followups, expenses);

  // The day's calls and follow-ups, each checked against Field Master Data and Territory as they are at sync.
  const checks = new CallChecks(master, territory, users, planning);
  const geofence = new GeofenceEvaluator(config);
  for (const definition of makeCallSyncHandlers({
    doctorCall: new LogDoctorCallUseCase(gate, checks, geofence, master, doctorCalls),
    chemistCall: new LogChemistCallUseCase(gate, checks, geofence, master, chemistCalls),
    followup: new LogFollowupUseCase(gate, checks, geofence, master, followups),
    parse: {
      doctorCall: (p) => doctorCallPayloadSchema.parse(p),
      chemistCall: (p) => chemistCallPayloadSchema.parse(p),
      doctorFollowup: (p) => doctorFollowupPayloadSchema.parse(p),
      chemistFollowup: (p) => chemistFollowupPayloadSchema.parse(p),
    },
  })) {
    sync.registerHandler(definition);
  }
  sync.registerHandler(makeExpenseSyncHandler(new LogExpenseUseCase(gate, expenses), (payload) => expensePayloadSchema.parse(payload)));
  for (const definition of makeServiceGiftSyncHandlers({
    service: new SubmitDoctorServiceUseCase(users, checks, services, approvals),
    gift: new MarkGiftDoneUseCase(users, checks, gifts),
    parse: { service: (p) => doctorServicePayloadSchema.parse(p), giftDone: (p) => giftDonePayloadSchema.parse(p) },
  })) {
    sync.registerHandler(definition);
  }
  sync.registerHandler(makeDcrSubmitSyncHandler(submitDcr, (payload) => dcrSubmitPayloadSchema.parse(payload)));

  // What the phone caches of this module (LLD sync.md, Pull).
  sync.registerSource(
    makeFieldActivitySource({
      clock,
      users,
      summary: dcrSummary,
      services: new ListDoctorServicesUseCase(services, approvals, master),
      gifts: new ListGiftsUseCase(gifts, master),
    }),
  );
  const missedDcrCheck = new RunMissedDcrCheckUseCase(users, leave, (userId, date) => hasQualifyingDcr.execute(userId, date), clock, config);

  return {
    runMissedDcrCheck: (options) => missedDcrCheck.execute(options),
    contract: {
      hasQualifyingDcr: (userId, date) => hasQualifyingDcr.execute(userId, date),
      listReportedDates: (userId, from, to) => listReportedDates.execute(userId, from, to),
      getPaidTaDaTotal: (userId, month) => paidTaDa.execute(userId, month),
      summarizeExpenses: (range) => expenses.summarizeByMonth(range),
      summarizeTaDaByUser: async (range) => (await expenses.statementsForRange(range)).map((s) => ({ userId: s.userId, taPaise: s.paid.taPaise + s.unpaid.taPaise, daPaise: s.paid.daPaise + s.unpaid.daPaise })),
      summarizeDcrs: (range) => summarizeDcrs.execute(range),
      listCalledDoctorIds: (userId, range) => listCalledDoctors.execute(userId, range),
      countDoctorCalls: (range) => countDoctorCalls.execute(range),
      listAcceptedExpenses: (f) => expenses.listAccepted({ from: f.from, to: f.to, ...(f.userId && { userId: f.userId }) }, f.limit ?? 2000),
      getDcrSummary: (userId, range) => dcrSummary.execute(userId, range),
    },
    buildRouter: () =>
      buildFieldActivityRouter(
        makeFieldActivityControllers({
          listMine: new ListMyDcrsUseCase(dcrs, views),
          listAll: new ListAllDcrsUseCase(dcrs, users, views),
          listTeam: new ListTeamDcrsUseCase(dcrs, users, views),
          adminService: new CreateAdminDoctorServiceUseCase(master, services),
          listServices: new ListDoctorServicesUseCase(services, approvals, master),
          getService: new GetDoctorServiceUseCase(services, approvals, master),
          markServiceDone: new MarkDoctorServiceDoneUseCase(services, approvals, master),
          allocateGift: new AllocateGiftUseCase(master, gifts),
          listGifts: new ListGiftsUseCase(gifts, master),
          listExpenses: new ListExpensesUseCase(expenses, users),
          markPaid: new MarkExpensePaidUseCase(expenses, config),
          expenseMonths: monthService,
          grantExpense: new GrantExpenseMonthUseCase(expenseGrants, expenses, users, config, () => new Date()),
          listExpenseGrants: new ListExpenseMonthGrantsUseCase(expenseGrants, users, () => new Date()),
          revokeExpenseGrant: new RevokeExpenseMonthGrantUseCase(expenseGrants, users, () => new Date()),
          expenseProof: new ExpenseProof(expenses, monthService, proofStorage),
          listPayouts: new ListExpensePayoutsUseCase(expenses, users, config, clock),
          payExpenses: new PayMonthExpensesUseCase(expenses, config),
          deleteRecord: new DeleteDcrRecordUseCase(dcrs, approvals, doctorCalls, chemistCalls, followups, master, new MongooseTransactionRunner()),
          override: new OverrideGeofenceUseCase(dcrs, users, views, doctorCalls, chemistCalls),
          get: new GetDcrDetailUseCase(new GetDcrUseCase(dcrs, users, views), doctorCalls, chemistCalls, followups, expenses, master),
        }),
      ),
  };
}
