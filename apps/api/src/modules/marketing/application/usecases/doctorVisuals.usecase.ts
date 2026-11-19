import type { DoctorVisual, Visual } from '../../domain/marketing.entities.js';
import type { DoctorVisualRepositoryPort, VisualRepositoryPort } from '../../domain/marketing.repository.ports.js';
import { MARKETING_CODES, MarketingRefusal } from '../../domain/marketingRefusal.js';
import type { DoctorPort, UserDirectoryPort } from '../../domain/ports.js';
import type { Actor } from './visualsAndCampaigns.usecase.js';

/**
 * What an actor may do with one Doctor's list (decision-log 2026-11-19): **add** — the Doctor's own MR and Admin, never a manager; **remove** — a manager above the
 * Doctor's MR and Admin, never the MR. A manager is anyone with people below them, also for a Doctor they hold themselves. Everyone allowed either can see the list.
 */
interface Access {
  canAdd: boolean;
  canRemove: boolean;
}

export interface DoctorVisualRow {
  visual: Visual;
  addedBy: string;
  addedByName: string | null;
  addedAt: Date;
}
export interface DoctorVisualList {
  items: DoctorVisualRow[];
  canAdd: boolean;
  canRemove: boolean;
}

async function accessTo(actor: Actor, doctorId: string, doctors: DoctorPort, users: UserDirectoryPort): Promise<Access> {
  if (!(await doctors.getDoctor(doctorId))) throw new MarketingRefusal(MARKETING_CODES.doctorNotFound, 'No such doctor.');
  if (actor.role === 'ADMIN') return { canAdd: true, canRemove: true };
  const downline = await users.getDownline(actor.id);
  const assigned = await doctors.getAssignedUserId(doctorId);
  if (assigned !== null && assigned !== actor.id && downline.some((u) => u.id === assigned)) return { canAdd: false, canRemove: true };
  if (await doctors.isAssignedToDoctor(actor.id, doctorId)) {
    // The doctor is theirs: an MR adds; someone with a team is a manager, who only takes visuals off.
    return downline.length > 0 ? { canAdd: false, canRemove: true } : { canAdd: true, canRemove: false };
  }
  throw new MarketingRefusal(MARKETING_CODES.notYourTeam, 'You can only use the visuals of your own doctors and your team’s.');
}

/** The Visuals picked for a Doctor, oldest pick first. Field staff don't see a Visual Admin has since turned off; Admin and managers see it, flagged by its status. */
export class ListDoctorVisualsUseCase {
  constructor(
    private readonly doctorVisuals: DoctorVisualRepositoryPort,
    private readonly visuals: VisualRepositoryPort,
    private readonly doctors: DoctorPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, doctorId: string): Promise<DoctorVisualList> {
    const access = await accessTo(actor, doctorId, this.doctors, this.users);
    const picks = await this.doctorVisuals.listActive(doctorId);
    const byId = new Map((await this.visuals.findByIds([...new Set(picks.map((p) => p.visualId))])).map((v) => [v.id, v]));
    const names = new Map<string, string | null>();
    for (const id of new Set(picks.map((p) => p.addedBy))) names.set(id, (await this.users.findUserSummary(id))?.name ?? null);
    const showInactive = access.canRemove;
    const items = picks.flatMap((p: DoctorVisual) => {
      const visual = byId.get(p.visualId);
      if (!visual || (visual.status !== 'active' && !showInactive)) return [];
      return [{ visual, addedBy: p.addedBy, addedByName: names.get(p.addedBy) ?? null, addedAt: p.addedAt }];
    });
    return { items, canAdd: access.canAdd, canRemove: access.canRemove };
  }
}

/** Adds Visuals to a Doctor's list — the Doctor's MR or Admin, not a manager. Only adds: picks already there stay as they were, and nothing here can take one off. */
export class AddDoctorVisualsUseCase {
  constructor(
    private readonly doctorVisuals: DoctorVisualRepositoryPort,
    private readonly visuals: VisualRepositoryPort,
    private readonly doctors: DoctorPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, doctorId: string, visualIds: string[]): Promise<void> {
    const access = await accessTo(actor, doctorId, this.doctors, this.users);
    if (!access.canAdd) throw new MarketingRefusal(MARKETING_CODES.onlyMrAdds, 'Only the doctor’s MR can add visuals for a doctor. A manager can take them off.');
    const ids = [...new Set(visualIds)];
    const found = await this.visuals.findByIds(ids);
    if (found.length !== ids.length || found.some((v) => v.status !== 'active')) throw new MarketingRefusal(MARKETING_CODES.visualNotFound, 'One of those visuals does not exist or is no longer active.');
    await this.doctorVisuals.addMany(doctorId, ids, actor.id, this.now());
  }
}

/** Takes one Visual off a Doctor's list — Admin, or a manager above the Doctor's MR. The Doctor's own MR cannot. */
export class RemoveDoctorVisualUseCase {
  constructor(
    private readonly doctorVisuals: DoctorVisualRepositoryPort,
    private readonly doctors: DoctorPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(actor: Actor, doctorId: string, visualId: string): Promise<void> {
    const access = await accessTo(actor, doctorId, this.doctors, this.users);
    if (!access.canRemove) throw new MarketingRefusal(MARKETING_CODES.onlyManagerRemoves, 'Only a manager or Admin can take a visual off a doctor’s list.');
    if (!(await this.doctorVisuals.remove(doctorId, visualId, actor.id, this.now()))) throw new MarketingRefusal(MARKETING_CODES.doctorVisualNotFound, 'That visual is not on this doctor’s list.');
  }
}
