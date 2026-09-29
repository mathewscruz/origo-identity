import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardSeriesPoint } from '@/hooks/useOrigoData';
const state = vi.hoisted(() => ({ series: [] as DashboardSeriesPoint[], period: vi.fn() }));
vi.mock('@/hooks/useOrigoData', () => ({ useDashboardMetrics: () => ({ data: { ultimo_ciclo: { status: 'done', display_status: 'paused', updated_at: '2026-09-18T00:00:00Z' }, ultimo_csv: { status: 'done', display_status: 'collected_not_imported', filename: 'fixture.csv', updated_at: '2026-09-18T00:00:00Z' } }, isLoading: false }), useDashboardSeries: (days: number) => { state.period(days); return { data: state.series, isLoading: false }; }, useParametro: () => 'true' }));
vi.mock('@/components/ActivityFeed', () => ({ default: () => null }));
vi.mock('@/hooks/usePeopleSeries', () => ({ usePeopleSeries: () => ({ data: [{ dia: '2026-09-18', entradas: 1, saidas: 3 }], isLoading: false }) }));
vi.mock('@/components/OnboardingTour', () => ({ default: () => null }));
vi.mock('recharts', () => ({ ResponsiveContainer: () => <div>Chart fixture</div>, Area: () => null, AreaChart: () => null, Bar: () => null, BarChart: () => null, CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null }));
import Dashboard from '@/pages/Dashboard';
afterEach(cleanup);
describe('RH dashboard contract fixtures, not production counts', () => {
 it('renders safe RH cards and keeps RH people separate from processed queue actions', () => {
  state.series = [{ dia: '2026-09-18', concessoes: 8, revogacoes: 9, outros: 0, falhas: 1, joiners: 0, movers: 0, leavers: 0, pre_leavers: 0, rh_entradas: 1, rh_saidas: 3, rh_parciais: 11, rh_cadastrais: 5 }];
  const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText('pausado por segurança')).toBeTruthy();
  expect(screen.getByText('coletada; não importada')).toBeTruthy();
  expect(screen.getByText(/1 entrada · 3 saídas/)).toBeTruthy();
  expect(screen.queryByText(/Fila: 8 ações de concessão/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
  expect(state.period).toHaveBeenLastCalledWith(7);
  state.series = [{ dia: '2026-09-18', concessoes: 0, revogacoes: 0, outros: 0, falhas: 0, joiners: 0, movers: 0, leavers: 0, pre_leavers: 0 }];
  view.rerender(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText(/1 entrada · 3 saídas/)).toBeTruthy();
 });
});
