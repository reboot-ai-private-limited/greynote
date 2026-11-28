import type { ChemistCall, DoctorCall, Followup } from '../../domain/call.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { Expense } from '../../domain/expense.entity.js';
import type { ChemistCallRepositoryPort, ExpenseRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { DcrView } from '../dcrViews.js';
import type { GetDcrUseCase, Actor } from './readDcrs.usecase.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DayOrdersPort } from '../../domain/dayOrders.port.js';
import type { DoctorGiftRepositoryPort, DoctorServiceRepositoryPort } from '../../domain/records.repository.port.js';
import type { SampleRequestRepositoryPort } from '../../domain/sampleRequest.repository.port.js';
import type { DoctorServiceType } from '../../domain/serviceGift.entity.js';
import type { DcrClock } from '../dcrClock.js';
import { DOCTOR_SERVICE_KIND } from './servicesAndGifts.usecase.js';

export interface DcrDetail extends DcrView {
  doctorCalls: Array<DoctorCall & { doctorName: string; samples: Array<DoctorCall['samples'][number] & { productName: string }>; lbl: Array<DoctorCall['lbl'][number] & { productName: string }> }>;
  chemistCalls: Array<ChemistCall & { chemistName: string }>;
  followups: Array<Followup & { subjectName: string }>;
  expenses: Expense[];
  /** The rest of the person's day (2026-11-28), by the report's date: absent from older servers, empty when nothing was done. */
  orders: Array<{ id: string; outletType: 'CHEMIST' | 'DISTRIBUTOR'; outletName: string; status: string; totalAmountPaise: number; remarks: string | null; items: Array<{ productName: string; quantity: number; amountPaise: number }> }>;
  giftsGiven: Array<{ id: string; doctorName: string; productName: string; amountPaise: number }>;
  giftRequests: Array<{ id: string; doctorName: string; productName: string; amountPaise: number; status: string; note: string | null }>;
  services: Array<{ id: string; doctorName: string; serviceType: DoctorServiceType; amountPaise: number; remarks: string | null; status: string }>;
  sampleRequests: Array<{ id: string; kind: string; status: string; remarks: string | null; lines: Array<{ productName: string; quantity: number }> }>;
}

/** Where the rest of the day is read from. Orders come from Sales, bound once it exists (`bindOrders`). */
export interface DayExtrasSources {
  services: DoctorServiceRepositoryPort;
  gifts: DoctorGiftRepositoryPort;
  sampleRequests: SampleRequestRepositoryPort;
  approvals: ApprovalsPort;
  clock: DcrClock;
}

/** How many of a person's newest records of each kind are looked through for the day's; a day never comes near it. */
const RECENT = 500;

/**
 * One DCR with everything on it — the manager's review screen — and, since 2026-11-28, the rest of that day: orders, gifts given and
 * asked for, service requests, sample/LBL requests. Readable by the owner, their managers and Admin
 * (the read check is `GetDcrUseCase`'s). Each call carries the server's geofence answer, so a `FAIL` or
 * `UNVERIFIED` shows next to the call's remarks for the reviewer.
 */
export class GetDcrDetailUseCase {
  constructor(
    private readonly base: GetDcrUseCase,
    private readonly doctorCalls: DoctorCallRepositoryPort,
    private readonly chemistCalls: ChemistCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
    private readonly expenses: ExpenseRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly extras?: DayExtrasSources,
  ) {}

  private orders: DayOrdersPort | null = null;
  bindOrders(orders: DayOrdersPort): void {
    this.orders = orders;
  }

  /** The person's orders, gifts, services and sample/LBL requests made on the report's day. */
  private async dayExtras(userId: string, date: string): Promise<Pick<DcrDetail, 'orders' | 'giftsGiven' | 'giftRequests' | 'services' | 'sampleRequests'>> {
    const none = { orders: [], giftsGiven: [], giftRequests: [], services: [], sampleRequests: [] };
    if (!this.extras) return none;
    const { services, gifts, sampleRequests, approvals, clock } = this.extras;
    const dayOf = await clock.dateConverter();
    const on = (at: Date | null | undefined) => (at ? dayOf(at) === date : false);
    const [orders, myServices, myGifts, requests] = await Promise.all([
      this.orders ? this.orders(userId, date) : Promise.resolve([]),
      services.list({ userId }, RECENT),
      gifts.list({ involving: userId }, RECENT),
      sampleRequests.list({ userId }, RECENT),
    ]);
    const dayServices = myServices.filter((s) => on(s.createdAt));
    const serviceStatus = new Map((await approvals.listForRecords(DOCTOR_SERVICE_KIND, dayServices.map((s) => s.id))).map((r) => [r.recordId, r.status]));
    const name = async (fn: () => Promise<{ name: string } | null>) => (await fn())?.name ?? '';
    const doctor = (id: string) => name(() => this.master.getDoctor(id));
    const product = (id: string) => name(() => this.master.getProduct(id));
    return {
      orders: await Promise.all(
        orders.map(async (o) => ({
          id: o.id,
          outletType: o.outlet.type,
          outletName: await name(() => (o.outlet.type === 'DISTRIBUTOR' ? this.master.getDistributor(o.outlet.id) : this.master.getChemist(o.outlet.id))),
          status: o.status,
          totalAmountPaise: o.totalAmountPaise,
          remarks: o.remarks,
          items: await Promise.all(o.items.map(async (i) => ({ productName: await product(i.productId), quantity: i.quantity, amountPaise: i.amountPaise }))),
        })),
      ),
      giftsGiven: await Promise.all(
        myGifts.filter((g) => g.status === 'DONE' && g.completedBy === userId && on(g.completedAt)).map(async (g) => ({ id: g.id, doctorName: await doctor(g.doctorId), productName: g.productName, amountPaise: g.amountPaise })),
      ),
      giftRequests: await Promise.all(
        myGifts.filter((g) => g.requestedBy === userId && on(g.requestedAt)).map(async (g) => ({ id: g.id, doctorName: await doctor(g.doctorId), productName: g.productName, amountPaise: g.amountPaise, status: g.status, note: g.requestNote })),
      ),
      services: await Promise.all(
        dayServices.map(async (s) => ({ id: s.id, doctorName: await doctor(s.doctorId), serviceType: s.serviceType, amountPaise: s.amountPaise, remarks: s.remarks, status: s.doneAt ? 'DONE' : (serviceStatus.get(s.id) ?? 'SUBMITTED') })),
      ),
      sampleRequests: await Promise.all(
        requests.filter((r) => on(r.requestedAt)).map(async (r) => ({ id: r.id, kind: r.kind, status: r.status, remarks: r.remarks, lines: await Promise.all(r.lines.map(async (l) => ({ productName: await product(l.productId), quantity: l.quantity }))) })),
      ),
    };
  }

  async execute(actor: Actor, id: string): Promise<DcrDetail> {
    const view = await this.base.execute(actor, id);
    const [doctorCalls, chemistCalls, followups, expenses] = await Promise.all([this.doctorCalls.listForDcr(id), this.chemistCalls.listForDcr(id), this.followups.listForDcr(id), this.expenses.listForDcr(id)]);
    const name = async (fn: () => Promise<{ name: string } | null>) => (await fn())?.name ?? '';
    return {
      ...view,
      ...(await this.dayExtras(view.userId, view.reportDate)),
      expenses,
      doctorCalls: await Promise.all(
        doctorCalls.map(async (c) => ({
          ...c,
          doctorName: await name(() => this.master.getDoctor(c.doctorId)),
          samples: await Promise.all(c.samples.map(async (s) => ({ ...s, productName: await name(() => this.master.getProduct(s.productId)) }))),
          lbl: await Promise.all(c.lbl.map(async (l) => ({ ...l, productName: await name(() => this.master.getProduct(l.productId)) }))),
        })),
      ),
      chemistCalls: await Promise.all(chemistCalls.map(async (c) => ({ ...c, chemistName: await name(() => this.master.getChemist(c.chemistId)) }))),
      followups: await Promise.all(followups.map(async (f) => ({ ...f, subjectName: await name(() => (f.subject === 'DOCTOR' ? this.master.getDoctor(f.subjectId) : this.master.getChemist(f.subjectId))) }))),
    };
  }
}
