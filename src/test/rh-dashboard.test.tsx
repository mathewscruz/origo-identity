import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DashboardSeriesPoint } from '@/hooks/useOrigoData';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

const state = vi.hoisted(() => ({ series: [] as DashboardSeriesPoint[], period: vi.fn() }));

vi.mock('@/hooks/useOrigoData', () => ({
  useDashboardMetrics: () => ({
    data: {
      gerado_em: '2026-09-18T00:00:00Z', colab_ativos: 10, colab_ferias: 0, colab_afastados: 0, terc_ativos: 3,
      fila_waiting: 0, fila_failed: 0, fila_success_24h: 0, revisoes_abertas: 0, excecoes_vencendo: 0, terc_vencidos: 0,
      quarentena: 0, sod_violacoes: 0, licencas_criticas: 0, fila_orfaos: 0, colab_sem_entra: 0, colab_sem_cargo: 0,
      priv_membros: 0, excecoes_pendentes: 0, fila_oldest_waiting: null, fila_oldest_pending: null,
      agente: [{ last_seen_at: '2026-09-18T00:00:00Z' }],
      ultimo_csv: { status: 'done', display_status: 'collected_not_imported', filename: 'fixture.csv', updated_at: '2026-09-18T00:00:00Z', source_modified_at: '2026-09-18T00:00:00Z', colab_created: 0, colab_updated: 0 },
    },
    isLoading: false, error: null, refetch: vi.fn(),
  }),
  useDashboardSeries: (days: number) => { state.period(days); return { data: state.series, isLoading: false, error: null, refetch: vi.fn(), isPlaceholderData: false }; },
  useParametro: () => 'true',
}));
vi.mock('@/components/ActivityFeed', () => ({ default: () => null, useActivityFeed: () => ({ data: [], isLoading: false }), acaoIcon: () => ({ icon: () => null, tone: '' }) }));
vi.mock('@/hooks/usePeopleSeries', () => ({ usePeopleSeries: () => ({ data: [{ dia: '2026-09-18', entradas: 1, saidas: 3 }], isLoading: false, error: null, refetch: vi.fn() }) }));
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
describe('RH dashboard contract fixtures, not production counts', () => {
  it('renders the RH status line and keeps entries/saídas separate from queue actions', async () => {
    rpc.mockResolvedValue({ data: { pessoas_ativas: 13, admissoes: 0, desligamentos: 0, aguardando: 0, falhas_24h: 0, revisoes_abertas: 0, excecoes_vencendo: 0, terceiros_vencidos: 0, quarentena: 0, licencas: [] }, error: null });
    state.series = [{ dia: '2026-09-18', concessoes: 8, revogacoes: 9, outros: 0, falhas: 1, joiners: 0, movers: 0, leavers: 0, pre_leavers: 0 } as unknown as DashboardSeriesPoint];
    mount();
    expect(await screen.findByText('Pessoas ativas')).toBeTruthy();
    expect(screen.queryByText('Ciclo RH')).toBeNull();
    expect(screen.queryByText('pausado por segurança')).toBeNull();
    expect(screen.getByText(/Base do RH atualizada/)).toBeTruthy();
    expect(screen.getByText('Execuções')).toBeTruthy();
    expect(screen.getByText(/Últimos 30 dias/)).toBeTruthy();
  });
});
