import type {
  SyncDraftsPage,
  SyncDraftUpload,
  SyncPushRequest,
  SyncPushResponse,
  SyncPutDraftsRequest,
  SyncPutDraftsResponse,
  SyncRecord,
} from '@greynote/contracts';
import type { makeKit } from '../application/usecases/syncTestKit.js';
import { listDraftsQuerySchema, pushBodySchema, putDraftsBodySchema } from './sync.schemas.js';

/**
 * A simulated field phone (LLD sync.md), for proving the protocol survives a bad connection. It keeps
 * its own records, backs unsent ones up whenever it has a connection, and at Submit sends the day in
 * chunks, parents first, the DCR's own submit last — the rules the real app will follow. The server it
 * talks to is the real engine behind a wire layer that validates with the real request schemas and
 * round-trips everything through JSON, so nothing but what a phone could actually receive gets across.
 *
 * `Network` decides, per call, whether the connection works — including the nasty case where the server
 * *did* process the request and only the reply was lost, so the phone can't tell.
 */

export class ConnectionLost extends Error {
  constructor(readonly whenLost: 'before' | 'after') {
    super(`connection lost ${whenLost} the server`);
  }
}

type Fault = 'ok' | 'dropBefore' | 'dropAfter';

export class Network {
  /** The next calls' fates, in order; `ok` once the script runs out. */
  script: Fault[] = [];
  /** Or a decider for every call (a seeded random one, for the property test). */
  decide: (() => Fault) | null = null;
  calls = 0;
  private next(): Fault {
    this.calls += 1;
    return this.script.shift() ?? this.decide?.() ?? 'ok';
  }
  async send<T>(deliver: () => Promise<T>): Promise<T> {
    const fault = this.next();
    if (fault === 'dropBefore') throw new ConnectionLost('before');
    const reply = await deliver();
    if (fault === 'dropAfter') throw new ConnectionLost('after'); // the server did the work; the phone never hears
    return reply;
  }
}

/** The server as the phone sees it: the wire in, the engine, the wire out. */
export class Server {
  constructor(
    private readonly kit: ReturnType<typeof makeKit>,
    private readonly userId: string,
  ) {}
  private get actor() {
    return { id: this.userId, role: 'FIELD' as const };
  }
  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    const body = pushBodySchema.parse(JSON.parse(JSON.stringify(request)));
    const result = await this.kit.push.execute(this.actor, body.records.map((r) => ({ ...r, payload: r.payload ?? null })));
    return JSON.parse(JSON.stringify(result)) as SyncPushResponse;
  }
  async putDrafts(request: SyncPutDraftsRequest): Promise<SyncPutDraftsResponse> {
    const body = putDraftsBodySchema.parse(JSON.parse(JSON.stringify(request)));
    return JSON.parse(JSON.stringify(await this.kit.putDrafts.execute(this.actor, body.drafts))) as SyncPutDraftsResponse;
  }
  async listDrafts(after: string | null): Promise<SyncDraftsPage> {
    const q = listDraftsQuerySchema.parse({ ...(after ? { after } : {}), limit: '50' });
    return JSON.parse(JSON.stringify(await this.kit.listDrafts.execute(this.actor, { after: q.after ?? null, limit: q.limit }))) as SyncDraftsPage;
  }
}

interface LocalRecord {
  clientId: string;
  kind: string;
  dependsOn: string[];
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  /** Gone from the day (the MR deleted it). */
  removed: boolean;
  /** Changed since the server last acknowledged a backup of it. */
  dirty: boolean;
  /** Reached the server. */
  serverId: string | null;
  /** The server's last reason for refusing it. */
  lastFailure: { code: string; message: string } | null;
}

export type SubmitOutcome = { submitted: boolean; failures: Array<{ clientId: string; code: string }>; attempts: number };

let seq = 0;
const newId = () => `10000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export class Phone {
  private records = new Map<string, LocalRecord>();
  /** The phone's own clock, as an offset from the server's, in ms. */
  clockSkewMs = 0;

  constructor(
    private readonly name: string,
    private readonly server: Server,
    private readonly network: Network,
    private readonly now: () => Date,
    private readonly maxBatch = 100,
  ) {}

  private stamp(): string {
    return new Date(this.now().getTime() + this.clockSkewMs).toISOString();
  }

  // ---- working offline -----------------------------------------------------------------------

  create(kind: string, payload: unknown, dependsOn: string[] = []): string {
    const clientId = newId();
    const at = this.stamp();
    this.records.set(clientId, { clientId, kind, dependsOn, payload, createdAt: at, updatedAt: at, removed: false, dirty: true, serverId: null, lastFailure: null });
    return clientId;
  }

  /**
   * The MR changes a record. If the server refused it for its creation time (a wrong phone clock), fixing it
   * re-dates it — the app re-stamps `clientCreatedAt` when the MR corrects a record the server rejected.
   */
  edit(clientId: string, payload: unknown): void {
    const r = this.get(clientId);
    const at = this.stamp();
    Object.assign(r, { payload, updatedAt: at, dirty: true, ...(r.lastFailure?.code === 'CLIENT_TIME_INVALID' && { createdAt: at }), lastFailure: null });
  }

  remove(clientId: string): void {
    Object.assign(this.get(clientId), { removed: true, updatedAt: this.stamp(), dirty: true });
  }

  private get(clientId: string): LocalRecord {
    const r = this.records.get(clientId);
    if (!r) throw new Error(`${this.name} has no record ${clientId}`);
    return r;
  }

  live(): LocalRecord[] {
    return [...this.records.values()].filter((r) => !r.removed);
  }
  state(clientId: string): LocalRecord {
    return this.get(clientId);
  }

  // ---- the private backup: whenever there is a connection --------------------------------------

  /** Uploads what changed since the server last acknowledged it. A dropped connection just leaves it for next time. */
  async backup(): Promise<void> {
    const dirty = [...this.records.values()].filter((r) => r.dirty && r.serverId === null);
    for (let i = 0; i < dirty.length; i += this.maxBatch) {
      const chunk = dirty.slice(i, i + this.maxBatch);
      const drafts: SyncDraftUpload[] = chunk.map((r) => (r.removed ? { clientId: r.clientId, clientUpdatedAt: r.updatedAt, deleted: true } : { clientId: r.clientId, clientUpdatedAt: r.updatedAt, kind: r.kind, payload: { payload: r.payload, dependsOn: r.dependsOn, createdAt: r.createdAt } }));
      let reply: SyncPutDraftsResponse;
      try {
        reply = await this.network.send(() => this.server.putDrafts({ drafts }));
      } catch (err) {
        if (err instanceof ConnectionLost) return; // try again next time there is signal
        throw err;
      }
      for (const result of reply.results) {
        const r = this.records.get(result.clientId);
        if (!r) continue;
        if (result.status === 'REJECTED') r.lastFailure = result.reason ?? null;
        else r.dirty = false; // STORED, STALE (a newer copy is held) and SUBMITTED (it's already on the server) all mean "stop sending it"
      }
    }
  }

  // ---- Submit: the daily report -----------------------------------------------------------------

  /**
   * Sends everything that hasn't reached the server, in chunks of at most `maxBatch`, parents first, and —
   * when `finalKind` is given — the DCR's own submit last, depending on all the rest. Retries a chunk whose
   * reply was lost (it can't tell whether the server acted, so it just sends it again), up to `maxAttempts`.
   */
  async submit(opts: { finalKind?: string; maxAttempts?: number } = {}): Promise<SubmitOutcome> {
    const maxAttempts = opts.maxAttempts ?? 20;
    const unsent = this.live().filter((r) => r.serverId === null);
    const finalId = opts.finalKind ? this.finalRecord(opts.finalKind, unsent) : null;
    const ordered = this.dependencyOrder([...unsent, ...(finalId ? [this.get(finalId)] : [])]);
    let attempts = 0;
    for (let i = 0; i < ordered.length; i += this.maxBatch) {
      const chunk = ordered.slice(i, i + this.maxBatch);
      let reply: SyncPushResponse | null = null;
      while (!reply && attempts < maxAttempts) {
        attempts += 1;
        try {
          reply = await this.network.send(() => this.server.push({ records: chunk.map((r) => this.wire(r)) }));
        } catch (err) {
          if (!(err instanceof ConnectionLost)) throw err;
        }
      }
      if (!reply) return this.outcome(attempts); // out of attempts: still offline; nothing is lost
      for (const result of reply.results) {
        const r = this.get(result.clientId);
        if (result.status === 'FAILED') r.lastFailure = result.reason ?? null;
        else Object.assign(r, { serverId: result.serverId ?? null, lastFailure: null, dirty: false });
      }
    }
    return this.outcome(attempts);
  }

  private outcome(attempts: number): SubmitOutcome {
    const failures = this.live().filter((r) => r.lastFailure).map((r) => ({ clientId: r.clientId, code: r.lastFailure!.code }));
    return { submitted: this.live().every((r) => r.serverId !== null), failures, attempts };
  }

  private wire(r: LocalRecord): SyncRecord {
    return { clientId: r.clientId, kind: r.kind, dependsOn: r.dependsOn, clientCreatedAt: r.createdAt, payload: r.payload };
  }

  /** The DCR's own submit: depends on every other record of the day, so a hole in the day keeps it from being submitted. */
  private finalRecord(kind: string, unsent: LocalRecord[]): string {
    const existing = this.live().find((r) => r.kind === kind && r.serverId === null);
    if (existing) {
      existing.dependsOn = [...new Set([...existing.dependsOn, ...unsent.filter((r) => r !== existing).map((r) => r.clientId)])];
      return existing.clientId;
    }
    return this.create(kind, { submittedAt: this.stamp() }, unsent.map((r) => r.clientId));
  }

  /** Parents before children, otherwise in the order made. */
  private dependencyOrder(records: LocalRecord[]): LocalRecord[] {
    const out: LocalRecord[] = [];
    const seen = new Set<string>();
    const visit = (r: LocalRecord) => {
      if (seen.has(r.clientId)) return;
      seen.add(r.clientId);
      for (const dep of r.dependsOn) {
        const parent = this.records.get(dep);
        if (parent && !parent.removed && parent.serverId === null) visit(parent);
      }
      out.push(r);
    };
    for (const r of records) visit(r);
    return out;
  }

  // ---- a new phone --------------------------------------------------------------------------------

  /** Brings the day back from the server's backup after the old phone was lost. Returns how many came back. */
  async restore(): Promise<number> {
    let after: string | null = null;
    let restored = 0;
    do {
      const page: SyncDraftsPage = await this.network.send(() => this.server.listDrafts(after));
      for (const d of page.drafts) {
        const blob = d.payload as { payload: unknown; dependsOn: string[]; createdAt: string };
        const held = this.records.get(d.clientId);
        if (held && held.updatedAt >= d.clientUpdatedAt) continue;
        this.records.set(d.clientId, { clientId: d.clientId, kind: d.kind, dependsOn: blob.dependsOn, payload: blob.payload, createdAt: blob.createdAt, updatedAt: d.clientUpdatedAt, removed: false, dirty: false, serverId: null, lastFailure: null });
        restored += 1;
      }
      after = page.nextCursor;
    } while (after);
    return restored;
  }
}
