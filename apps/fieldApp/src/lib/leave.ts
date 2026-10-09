import type { PlanStatus } from '@/types/sync';

import { apiDelete, apiGet, apiPost, apiPut, apiUpload, type UploadFile } from './api';

/**
 * The HR leave endpoints. A leave request goes to the manager, then HR/Admin, and every action here
 * needs a connection (the plan's "Leave: online"). The server counts the days (off days and holidays
 * excluded) and checks the balance, so its message is what the screen shows.
 */
export type LeaveBody = { leaveTypeId: string; startDate: string; endDate: string; reason: string };

export type LeaveAttachment = { id: string; url: string; fileName: string; mimeType: string; sizeBytes: number };

export type LeaveView = {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  daysCount: number;
  isPaid: boolean;
  status: PlanStatus;
  approval: { requestId: string } | null;
  /** This kind of leave takes proof (a prescription, a medical certificate). Optional for the employee. */
  allowsProof: boolean;
  attachments: LeaveAttachment[];
};

type Page<T> = { items: T[]; total: number };

export type LeaveType = { id: string; name: string; isPaid: boolean; allowsProof: boolean; active: boolean };

/** The leave types, with which of them take proof (the offline sync data doesn't say). */
export const listLeaveTypes = () => apiGet<LeaveType[]>('/hr/leave-types');

export const requestLeave = (body: LeaveBody) => apiPost<LeaveView>('/hr/leaves', body, { auth: true });

export const editLeave = (id: string, body: LeaveBody) => apiPut<LeaveView>(`/hr/leaves/${id}`, body);

export const listMyLeaves = async () => (await apiGet<Page<LeaveView>>('/hr/leaves/me?pageSize=50')).items;

export const withdrawLeave = (requestId: string) =>
  apiPost<unknown>(`/approvals/${requestId}/withdraw`, {}, { auth: true });

/** A leave the owner can still change: sent back, withdrawn or reopened. */
export const LEAVE_EDITABLE: PlanStatus[] = ['REJECTED', 'WITHDRAWN', 'REOPENED'];

/** The server's rules for proof: PDF, JPG or PNG, up to 5 MB, at most 3 files (checked here first to save a failed upload). */
export const MAX_PROOF_FILES = 3;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export const addLeaveProof = (leaveId: string, file: UploadFile) =>
  apiUpload<LeaveAttachment[]>(`/hr/leaves/${leaveId}/attachments`, file);

export const removeLeaveProof = (leaveId: string, attachmentId: string) =>
  apiDelete<LeaveAttachment[]>(`/hr/leaves/${leaveId}/attachments/${attachmentId}`);
