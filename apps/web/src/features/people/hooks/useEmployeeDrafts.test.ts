import type { EmployeeDraftDto } from '@greynote/contracts';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { keys } from '@/lib/query/keys';
import { forgetDraft, rememberDraft } from './useEmployeeDrafts';

const draft = (over: Partial<EmployeeDraftDto>): EmployeeDraftDto => ({
  id: 'd1',
  createdBy: 'u1',
  step: 2,
  data: { personal: { name: 'Rahim' } },
  createdUserId: null,
  createdAt: '2026-10-09T07:50:00.000Z',
  updatedAt: '2026-10-09T07:50:00.000Z',
  ...over,
});

describe('draft cache', () => {
  it('keeps the latest save, so Continue reopens the draft as last saved and not as first created', () => {
    const queryClient = new QueryClient();
    rememberDraft(queryClient, draft({}));
    rememberDraft(queryClient, draft({ step: 8, data: { personal: { name: 'Rahim' }, address: { permanentSameAsPresent: true } } }));
    expect(queryClient.getQueryData<EmployeeDraftDto>(keys.employeeDrafts.detail('d1'))).toMatchObject({ step: 8, data: { address: { permanentSameAsPresent: true } } });
  });

  it('drops a draft that was deleted or turned into an employee', () => {
    const queryClient = new QueryClient();
    rememberDraft(queryClient, draft({}));
    forgetDraft(queryClient, 'd1');
    expect(queryClient.getQueryData(keys.employeeDrafts.detail('d1'))).toBeUndefined();
  });
});
