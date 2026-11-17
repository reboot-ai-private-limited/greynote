import { apiGet } from './api';

/** A gift Admin set aside for a doctor, given or not (docs/mobile/visuals-gifts-services.md §2). `userId`/`userName`: the MR who holds the doctor, on a manager's team list. */
export type GiftView = {
  id: string;
  doctorId: string;
  doctorName: string;
  productName: string;
  amountPaise: number;
  status: 'PENDING' | 'DONE';
  allocatedAt: string;
  completedAt: string | null;
  userId?: string;
  userName?: string;
};

/** Every gift, pending and done, newest first. A manager passes `team` to also get the gifts of doctors held below them. */
export const listGifts = async (team: boolean) => {
  const data = await apiGet<GiftView[] | { items: GiftView[] }>(`/field-activity/doctor-gifts${team ? '?scope=team' : ''}`, { auth: true });
  return Array.isArray(data) ? data : data.items;
};
