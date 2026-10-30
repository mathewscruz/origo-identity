import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AutoUpdatedHint } from '@/components/AutoUpdatedHint';

const rpc = vi.hoisted(() => vi.fn());
const latest = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn(() => ({
  select: () => ({ eq: () => ({ order: () => ({ limit: latest }) }) }),
})));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from } }));

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); rpc.mockReset(); latest.mockReset(); from.mockClear(); });

describe('RH auto-refresh', () => {
  it('stops saying aguardando after the Hermes task finishes and refreshes quarantine', async () => {
    vi.useFakeTimers();
    rpc.mockImplementation((name: string) => Promise.resolve({
      data: name === 'agent_refresh_request' ? { queued: true, open: false, last_at: null } : {}, error: null,
    }));
    latest.mockResolvedValue({ data: [{ status: 'done', finished_at: '2026-10-30T12:00:00Z' }], error: null });
    const invalidated = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><AutoUpdatedHint tasks="quarantine-triage" /></QueryClientProvider>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText('Aguardando o Hermes atualizar')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.queryByText('Aguardando o Hermes atualizar')).toBeNull();
    expect(screen.getByText(/Atualizado/)).toBeTruthy();
    expect(invalidated).toHaveBeenCalledWith({ queryKey: ['colab_quarentena'] });
    expect(from).toHaveBeenCalledWith('agent_tasks');
  });
});
