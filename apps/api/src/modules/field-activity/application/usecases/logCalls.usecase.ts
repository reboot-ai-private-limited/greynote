import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { LOG_CODES, LogRefusal } from '../../domain/logRefusal.js';
import type { ChemistCall, DoctorCall, Followup, GeofenceOutcome, SampleLine } from '../../domain/call.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { CallChecks } from '../callChecks.js';
import type { GeofenceEvaluator } from '../geofenceEvaluator.js';
import type { LoggingGate } from '../loggingGate.js';

/** What every record of the day arrives with (the sync engine's record context). */
export interface RecordContext {
  userId: string;
  /** The phone's id for the record. */
  clientId: string;
  /** When the MR made it on the phone. */
  recordedAt: Date;
}

interface CallInput {
  reportDate: string;
  workWith: string[];
  remarks: string | null;
  capturedLocation: { latitude: number; longitude: number } | null;
  accuracyMeters: number | null;
}

/** The server's own version of a call that goes back to the phone (sign-off G10). */
export interface CallResult {
  serverId: string;
  data: { geofence: Pick<GeofenceOutcome, 'status' | 'distanceMeters' | 'reason'> };
}
const resultOf = (id: string, g: GeofenceOutcome): CallResult => ({ serverId: id, data: { geofence: { status: g.status, distanceMeters: g.distanceMeters, reason: g.reason } } });

/**
 * A Doctor Call (LLD field-activity.md, *Calls*). In order: the gate (blocked, the day, the Plan, the DCR not
 * already sent) → the Doctor is active and still assigned to this MR → the day is a field day → the colleagues are real →
 * the MR is at the Doctor's stored location (else refused, nothing stored) → each sample line draws its allocation down.
 * The work type and the Route's type are stamped from the plan and the Doctor, never taken from the phone; "not in plan"
 * and "route not in plan" are flags.
 *
 * Runs inside the sync engine's transaction, so a sample line that can't be covered (`SAMPLES_EXHAUSTED`) undoes
 * the lines already drawn and the call itself — the record fails alone, with the rest of the day intact. The
 * phone's own geofence result isn't accepted: the server's is the only one.
 */
export class LogDoctorCallUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly checks: CallChecks,
    private readonly geofence: GeofenceEvaluator,
    private readonly master: FieldMasterDataPort,
    private readonly calls: DoctorCallRepositoryPort,
  ) {}

  async execute(rec: RecordContext, input: CallInput & { doctorId: string; samples: Array<{ productId: string; quantity: number }> }, ctx: TransactionContext): Promise<CallResult> {
    const dcr = await this.gate.open(rec.userId, input.reportDate, rec.recordedAt);
    const doctor = await this.checks.doctor(rec.userId, input.doctorId);
    const day = await this.checks.day(rec.userId, input.reportDate);
    const { routeId, routeType, routeNotInPlan } = await this.checks.route(day, doctor.routeId);
    const notInPlan = this.checks.doctorNotInPlan(day, doctor.id, routeNotInPlan);
    await this.checks.workWith(rec.userId, input.workWith);
    const geofence = await this.geofence.requirePass('doctor', await this.master.getDoctorLocation(input.doctorId), input.capturedLocation, input.accuracyMeters);

    const samples: SampleLine[] = [];
    for (const line of input.samples) {
      const allocation = await this.master.getSampleAllocation(input.doctorId, line.productId);
      if (!allocation) throw new LogRefusal(LOG_CODES.noSampleAllocation, 'No samples of this product have been issued for this doctor.');
      // One conditional update: two calls racing for the last units can't both succeed, and one refused line rolls back the rest.
      if (!(await this.master.decrementRemaining(allocation.id, line.quantity, ctx))) {
        throw new LogRefusal(LOG_CODES.samplesExhausted, `Not enough samples left: ${allocation.quantityRemaining} available, ${line.quantity} asked for.`);
      }
      samples.push({ allocationId: allocation.id, productId: line.productId, quantity: line.quantity });
    }

    const call = await this.calls.create(
      { dcrId: dcr.id, userId: rec.userId, reportDate: input.reportDate, doctorId: input.doctorId, workingType: day.workingType, routeId, routeType, routeNotInPlan, workWith: input.workWith, remarks: input.remarks, capturedLocation: input.capturedLocation, accuracyMeters: input.accuracyMeters, geofence, samples, notInPlan, clientId: rec.clientId, recordedAt: rec.recordedAt },
      ctx,
    );
    return resultOf(call.id, geofence);
  }
}

/** A Chemist Call: the same as a Doctor Call without samples; the Chemist's Route is one the MR covers, and a Route the day's plan doesn't list is a flag. */
export class LogChemistCallUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly checks: CallChecks,
    private readonly geofence: GeofenceEvaluator,
    private readonly master: FieldMasterDataPort,
    private readonly calls: ChemistCallRepositoryPort,
  ) {}

  async execute(rec: RecordContext, input: CallInput & { chemistId: string }, ctx: TransactionContext): Promise<CallResult> {
    const dcr = await this.gate.open(rec.userId, input.reportDate, rec.recordedAt);
    const chemist = await this.checks.chemist(rec.userId, input.chemistId);
    const day = await this.checks.day(rec.userId, input.reportDate);
    const { routeId, routeType, routeNotInPlan } = await this.checks.route(day, chemist.routeId);
    await this.checks.workWith(rec.userId, input.workWith);
    const geofence = await this.geofence.requirePass('chemist', await this.master.getChemistLocation(input.chemistId), input.capturedLocation, input.accuracyMeters);
    const call = await this.calls.create(
      { dcrId: dcr.id, userId: rec.userId, reportDate: input.reportDate, chemistId: input.chemistId, workingType: day.workingType, routeId, routeType, routeNotInPlan, workWith: input.workWith, remarks: input.remarks, capturedLocation: input.capturedLocation, accuracyMeters: input.accuracyMeters, geofence, clientId: rec.clientId, recordedAt: rec.recordedAt },
      ctx,
    );
    return resultOf(call.id, geofence);
  }
}

/**
 * A follow-up note on a Doctor or a Chemist — remarks, attached to the day's DCR. The same gate, the same checks on who it's about,
 * and the same location rule as a call: the MR must be at the Doctor or Chemist. A Doctor not on the day's list, or a Chemist whose
 * Route the plan doesn't list, is flagged `notInPlan` for the report. There is no carry-forward: missed planned doctors already carry.
 */
export class LogFollowupUseCase {
  constructor(
    private readonly gate: LoggingGate,
    private readonly checks: CallChecks,
    private readonly geofence: GeofenceEvaluator,
    private readonly master: FieldMasterDataPort,
    private readonly followups: FollowupRepositoryPort,
  ) {}

  async execute(
    rec: RecordContext,
    input: { reportDate: string; subject: 'DOCTOR' | 'CHEMIST'; subjectId: string; remarks: string; capturedLocation: { latitude: number; longitude: number } | null; accuracyMeters: number | null },
    ctx: TransactionContext,
  ): Promise<CallResult> {
    const dcr = await this.gate.open(rec.userId, input.reportDate, rec.recordedAt);
    const doctor = input.subject === 'DOCTOR' ? await this.checks.doctor(rec.userId, input.subjectId) : null;
    const chemist = input.subject === 'CHEMIST' ? await this.checks.chemist(rec.userId, input.subjectId) : null;
    const day = await this.checks.day(rec.userId, input.reportDate);
    const { routeId, routeType, routeNotInPlan } = await this.checks.route(day, (doctor ?? chemist)!.routeId);
    const notInPlan = doctor ? this.checks.doctorNotInPlan(day, doctor.id, routeNotInPlan) : routeNotInPlan;
    const geofence = await this.geofence.requirePass(
      doctor ? 'doctor' : 'chemist',
      doctor ? await this.master.getDoctorLocation(doctor.id) : await this.master.getChemistLocation(chemist!.id),
      input.capturedLocation,
      input.accuracyMeters,
    );
    const created: Followup = await this.followups.create(
      { dcrId: dcr.id, userId: rec.userId, reportDate: input.reportDate, subject: input.subject, subjectId: input.subjectId, remarks: input.remarks, workingType: day.workingType, routeId, routeType, notInPlan, capturedLocation: input.capturedLocation, accuracyMeters: input.accuracyMeters, geofence, clientId: rec.clientId, recordedAt: rec.recordedAt },
      ctx,
    );
    return resultOf(created.id, geofence);
  }
}

export type { ChemistCall, DoctorCall };
