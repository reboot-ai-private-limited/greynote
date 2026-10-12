import type { CompanyDocumentDto } from '@greynote/contracts';
import { request } from '../client';

export const documentsApi = {
  /** Admin: the whole library, newest first. */
  list: (token: string, signal?: AbortSignal) =>
    request<CompanyDocumentDto[]>('/documents', { token, signal }),
  upload: (token: string, body: FormData) =>
    request<CompanyDocumentDto>('/documents', { method: 'POST', token, body }),
  remove: (token: string, id: string) =>
    request<null>(`/documents/${id}`, { method: 'DELETE', token }),
};
