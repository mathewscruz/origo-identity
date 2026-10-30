import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const state = vi.hoisted(() => ({
  metrics: { data: undefined as Record<string, unknown> | undefined, isLoading: false, error: new Error('RPC missing') as Error | null, refetch: vi.fn() },
  series: { data: [] as unknown[], isLoading: false, error: new Error('RPC missing') as Error | null, refetch: vi.fn(), isPlaceholderData: false },
  people: { data: [] as unknown[], isLoading: false, error: new Error('RPC missing') as Error | null, refetch: vi.fn() },
}));

vi.mock('@/hooks/useOrigoData', () => ({
  useDashboardMetrics: () => state.metrics,
  useDashboardSeries: () => state.series,
  useParametro: () => 'true',
}));
vi.mock('@/hooks/usePeopleSeries', () => ({ usePeopleSeries: () => state.people }));
vi.mock('@/components/ActivityFeed', () => ({ default: () => <div>Independent activity feed</div>, useActivityFeed: () => ({ data: [], isLoading: false }), acaoIcon: () => ({ icon: () => null, tone: '' }) }));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => <div>Chart fixture</div>, Area: () => null, AreaChart: () => null, Bar: () => null,
  BarChart: () => null, CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

import Dashboard from '@/pages/Dashboard';

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>);
}

afterEach(cleanup);
beforeEach(() => {
  rpc.mockReset();
  state.metrics = { data: undefined, isLoading: false, error: new Error('RPC missing'), refetch: vi.fn() };
  state.series = { data: [], isLoading: false, error: new Error('RPC missing'), refetch: vi.fn(), isPlaceholderData: false };
  state.people = { data: [], isLoading: false, error: new Error('RPC missing'), refetch: vi.fn() };
});

describe('Dashboard read failures', () => {
  it('shows one read error instead of zero KPIs, false empty governance or agent status when RPCs fail', () => {
    rpc.mockResolvedValue({ data: null, error: new Error('dashboard_kpis missing') });
    mount();
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes('Não foi possível carregar os dados'))).toBe(true);
    expect(screen.queryByText('Pessoas ativas')).toBeNull();
    expect(screen.queryByText('Nenhuma pendência — tudo em dia.')).toBeNull();
    expect(screen.queryByText(/Hermes online/)).toBeNull();
    expect(screen.getByText('Atividade recente')).toBeTruthy();
  });

  it('keeps loading distinct from error and confirmed zero', async () => {
    state.metrics.error = null; state.metrics.isLoading = true; state.series.error = null; state.people.error = null;
    const first = mount();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando dados');
    expect(screen.queryByText('Pessoas ativas')).toBeNull();
    first.unmount();

    state.metrics.isLoading = false;
    state.metrics.data = { gerado_em: '2026-10-20T12:00:00Z', colab_ativos: 10, colab_ferias: 2, colab_afastados: 1, colab_inativos: 5, colab_desligados: 7, terc_ativos: 3, terc_inativos: 4, colab_suspensos: 2, fila_waiting: 0, fila_failed: 0, fila_success_24h: 0, revisoes_abertas: 0, excecoes_vencendo: 0, terc_vencidos: 0, quarentena: 0, sod_violacoes: 0, licencas_criticas: 0, fila_orfaos: 0, colab_sem_entra: 0, colab_sem_cargo: 0, priv_membros: 0, excecoes_pendentes: 0, fila_oldest_waiting: null, fila_oldest_pending: null, agente: [{ last_seen_at: '2026-10-20T12:00:00Z' }], ultimo_csv: { status: 'done', source_modified_at: '2026-10-20T11:00:00Z', colab_created: 1, colab_updated: 2 } };
    rpc.mockResolvedValue({ data: { pessoas_ativas: 17, admissoes: 0, desligamentos: 0, aguardando: 0, falhas_24h: 0, falhas_prev: 0, revisoes_abertas: 0, excecoes_vencendo: 0, terceiros_vencidos: 0, quarentena: 0, licencas: [] }, error: null });
    mount();
    expect(await screen.findByText('Pessoas ativas')).toBeTruthy();
    expect(await screen.findByText('17')).toBeTruthy();
    expect(screen.getByText('Pessoas ativas').closest('a')?.getAttribute('href')).toBe('/colaboradores?status=ativo');
    expect(screen.getByLabelText('Categoria de Usuários: total').textContent).toBe('16');
    expect(screen.getByText('Aguardando')).toBeTruthy();
  });
});
