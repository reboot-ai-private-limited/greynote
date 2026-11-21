import { apiGet, apiPost } from './api';

/** A gift Admin set aside for a doctor, given or not (docs/mobile/visuals-gifts-services.md §2). `userId`/`userName`: the MR who holds the doctor, on a manager's team list. */
export type GiftView = {
  id: string;
  doctorId: string;
  doctorName: string;
  productName: string;
  amountPaise: number;
  /** REQUESTED = an employee asked and Admin/Accounts haven't answered; PENDING = to give; DONE = given; REJECTED = turned down. */
  status: 'REQUESTED' | 'PENDING' | 'DONE' | 'REJECTED';
  /** Absent from older servers: read as `ADMIN`. */
  origin?: 'ADMIN' | 'EMPLOYEE';
  requestNote?: string | null;
  rejectReason?: string | null;
  requestedByName?: string;
  allocatedAt: string;
  completedAt: string | null;
  userId?: string;
  userName?: string;
};

/** One person of my team: their gifts (Admin's and their own requests), every status. */
export const listPersonGifts = async (userId: string) => {
  const data = await apiGet<GiftView[] | { items: GiftView[] }>(`/field-activity/doctor-gifts?userId=${userId}`, { auth: true });
  return Array.isArray(data) ? data : data.items;
};

/** Ask for a gift for one of my doctors. Online only; Admin or Accounts answer it. */
export const requestGift = (body: { doctorId: string; productName: string; note: string | null }) => apiPost<GiftView>('/field-activity/doctor-gifts/requests', body, { auth: true });

export const giftStatusText = (s: GiftView['status']): string => (s === 'REQUESTED' ? 'Requested' : s === 'PENDING' ? 'To give' : s === 'DONE' ? 'Done' : 'Rejected');

/** Every gift, pending and done, newest first. A manager passes `team` to also get the gifts of doctors held below them. */
export const listGifts = async (team: boolean) => {
  const data = await apiGet<GiftView[] | { items: GiftView[] }>(`/field-activity/doctor-gifts${team ? '?scope=team' : ''}`, { auth: true });
  return Array.isArray(data) ? data : data.items;
};
