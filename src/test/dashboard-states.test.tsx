import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ metrics: { data: undefined as Record<string, unknown> | undefined, isLoading: false, error: new Error('RPC missing') as Error | null, refetch: vi.fn() }, series: { data: undefined, isLoading: false, error: new Error('RPC missing'), refetch: vi.fn() } }));
vi.mock('@/hooks/usePeopleSeries', () => ({ usePeopleSeries: () => state.series }));
vi.mock('@/hooks/useOrigoData', () => ({ useDashboardMetrics: () => state.metrics, useDashboardSeries: () => state.series, useParametro: () => 'true' }));
vi.mock('@/components/ActivityFeed', () => ({ default: () => <div>Independent activity feed</div> }));
vi.mock('@/components/OnboardingTour', () => ({ default: () => null }));
import Dashboard from '@/pages/Dashboard';
afterEach(cleanup);
describe('Dashboard read failures', () => {
 it('does not render zero KPIs, false empty governance or offline agents when RPCs fail', () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getAllByRole('alert').length).toBe(4);
  expect(screen.queryByText('Pessoas ativas')).toBeNull();
  expect(screen.queryByText('Nenhuma pendência — tudo em dia.')).toBeNull();
  expect(screen.queryByText('nunca visto')).toBeNull();
  expect(screen.getByText('Independent activity feed')).toBeTruthy();
 });
 it('keeps loading distinct from error and confirmed zero', () => {
  state.metrics.error = null; state.metrics.isLoading = true;
  const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getAllByRole('status').length).toBe(2);
  expect(screen.queryByText('Pessoas ativas')).toBeNull();
  state.metrics.isLoading = false;
  state.metrics.data = { gerado_em: '2026-09-17T21:00:00Z', colab_ativos: 10, colab_ferias: 2, colab_afastados: 1, colab_inativos: 5, colab_desligados: 7, terc_ativos: 3, terc_inativos: 4, colab_suspensos: 2, fila_success_7d: 0, fila_falhas_por_codigo: [{ codigo: 'codigo_inesperado', total: 2 }] };
  view.rerender(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText('Pessoas ativas')).toBeTruthy();
  expect(screen.getByText('Fila do agente').closest('a')?.getAttribute('href')).toBe('/fila-provisionamento?status=agente');
  expect(screen.getByText('Suspensos (pré-leaver)').closest('a')?.getAttribute('href')).toBe('/colaboradores?suspenso_preventivo=true');
  expect(screen.getByText('Concluídos (7 dias)').closest('a')?.getAttribute('href')).toContain('processed_from=');
  expect(screen.getByText('Fila atual')).toBeTruthy();
  expect(screen.getByText('Cadastros por status')).toBeTruthy();
  expect(screen.getByText('Terceiros inativos')).toBeTruthy();
  expect(screen.getByLabelText('Cadastros por status: total').textContent).toBe('32');
  expect(screen.getByText('10 ativos · 2 férias · 1 afastados · 3 terceiros')).toBeTruthy();
  expect(screen.getByTitle('codigo_inesperado').textContent).toBe('Codigo inesperado · 2');
 });
});
