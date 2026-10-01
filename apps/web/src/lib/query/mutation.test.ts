import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth/session', () => ({
  withAuth: (call: (token: string) => Promise<unknown>) => call('tok'),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { buildMutationFn } = await import('./mutation');

describe('buildMutationFn', () => {
  it('passes the token and the variables to the call', async () => {
    const call = vi.fn().mockResolvedValue('done');
    await expect(buildMutationFn(call)({ name: 'North' })).resolves.toBe('done');
    expect(call).toHaveBeenCalledWith('tok', { name: 'North' });
  });
});
