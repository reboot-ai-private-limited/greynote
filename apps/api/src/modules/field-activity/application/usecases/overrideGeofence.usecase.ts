import { AppError } from '@/shared/errors/AppError.js';
import type { ChemistCall, DoctorCall } from '../../domain/call.entity.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort } from '../../domain/records.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { DcrViews } from '../dcrViews.js';
import type { Actor } from './readDcrs.usecase.js';

/**
 * A manager accepting a call the geofence flagged (LLD field-activity.md, *Geofence override*). It is an action
 * on the call, separate from approving the day, so a manager can accept two flagged calls and still reject the DCR.
 *
 * Who: the employee's nearest manager while the DCR is `SUBMITTED` (their stage), Admin at `SUBMITTED` or
 * `MANAGER_APPROVED`. Nobody else — not the higher managers, not the owner. A comment is required. The computed
 * distance and reason stay on the call beside who, when and why. A `PASS` call, or one already overridden, is a 409.
 */
export class OverrideGeofenceUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly views: DcrViews,
    private readonly doctorCalls: DoctorCallRepositoryPort,
    private readonly chemistCalls: ChemistCallRepositoryPort,
  ) {}

  async execute(actor: Actor, dcrId: string, callId: string, comment: string, now: Date = new Date()): Promise<DoctorCall | ChemistCall> {
    const dcr = await this.dcrs.findById(dcrId);
    if (!dcr) throw AppError.notFound('No such report.');
    const [doctorCall, chemistCall] = await Promise.all([this.doctorCalls.findById(callId), this.chemistCalls.findById(callId)]);
    const call = doctorCall ?? chemistCall;
    // A call of another DCR is "not found" here, so the id can't be used to probe other reports.
    if (!call || call.dcrId !== dcr.id) throw AppError.notFound('No such call on this report.');

    const status = (await this.views.one(dcr)).status;
    if (status !== 'SUBMITTED' && status !== 'MANAGER_APPROVED') throw AppError.conflict('This report is not under review.');
    const nearest = (await this.users.getManagerChain(dcr.userId))[0];
    const may = actor.role === 'ADMIN' || (status === 'SUBMITTED' && nearest?.id === actor.id);
    if (!may) throw AppError.forbidden('Only the reviewing manager or an Admin can accept a flagged call.');

    if (call.geofence.status === 'PASS') throw AppError.conflict('This call passed the check; there is nothing to override.');
    if (call.geofence.status === 'OVERRIDE') throw AppError.conflict('This call was already accepted.');

    const repo = doctorCall ? this.doctorCalls : this.chemistCalls;
    if (!(await repo.overrideGeofence(call.id, { by: actor.id, at: now, comment }))) throw AppError.conflict('This call was already accepted.');
    return (await repo.findById(call.id))!;
  }
}
