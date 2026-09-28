import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import ActivityFeed from '@/components/ActivityFeed';
const item = (id: string, pessoa: string, extra = {}) => ({ fonte: 'fila', id, pessoa, ts: '2026-09-18T12:00:00Z', categoria: 'pessoa', acao: 'disable_account', status: 'success', origem: 'csv', pessoa_tipo: 'colaborador', ator: 'hermes', recurso: null, detalhe: 'Bloqueio no AD; conta preservada.', link: '/colaboradores/' + id, ...extra });
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ActivityFeed /><Location /></MemoryRouter></QueryClientProvider>); }
afterEach(cleanup);
beforeEach(() => { rpc.mockReset(); });
describe('Individual activity fixtures (not production data)', () => {
 it('preserves separate people and removes only identical source/id duplicates', async () => {
  const ana = item('a', 'Ana Teste');
  rpc.mockResolvedValue({ data: [ana, ana, item('b', 'Bruno Teste'), item('c', 'Ana Teste', { acao: 'remove_license' })], error: null });
  mount();
  await screen.findByText(/Bruno Teste/);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getAllByText(/Ana Teste/)).toHaveLength(2);
  expect(screen.getAllByText(/Fonte: Fila IAM/).length).toBe(3);
  expect(screen.queryByText(/Conta excluída/)).toBeNull();
  fireEvent.click(screen.getByText(/Bruno Teste/));
  expect(screen.getByTestId('location').textContent).toBe('/colaboradores/b');
 });
 it('shows pending and partial states without claiming completion', async () => {
  rpc.mockResolvedValue({ data: [item('a', 'Ana Teste', { fonte: 'auditoria', status: 'partial' }), item('b', 'Bruno Teste', { status: 'pending' })], error: null });
  mount();
  expect(await screen.findByText('Parcial')).toBeTruthy();
  expect(screen.getByText('Pendente (agente)')).toBeTruthy();
  expect(screen.queryByText('Concluído')).toBeNull();
 });
 it('sends category filters to the RPC and keeps errors distinct from empty', async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  mount(); await screen.findByText('Nenhuma atividade registrada ainda.');
  rpc.mockResolvedValue({ data: null, error: new Error('Unavailable') });
  fireEvent.click(screen.getByRole('button', { name: 'Pessoas' }));
  await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('dashboard_activity', expect.objectContaining({ p_categoria: 'pessoa' })));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
  expect(screen.queryByText('Nenhuma atividade registrada ainda.')).toBeNull();
 });
 it('renders fourteen separate RH people and filters RH before the server limit', async () => {
  const people = Array.from({ length: 14 }, (_, i) => item(`rh-${i}`, `Pessoa fixture ${i}`, { fonte: 'auditoria', origem: 'rh', acao: 'rh_desligamento', status: i === 0 ? 'success' : i === 1 ? 'failed' : 'partial' }));
  rpc.mockResolvedValue({ data: people, error: null }); mount();
  await screen.findByText(/Pessoa fixture 13/);
  expect(screen.getAllByRole('listitem')).toHaveLength(14);
  expect(screen.getAllByText('Parcial')).toHaveLength(12);
  expect(screen.getByText('Concluído')).toBeTruthy();
  expect(screen.getByText('Falhou')).toBeTruthy();
  expect(screen.getAllByText(/Fonte: Auditoria · RH/)).toHaveLength(14);
  expect(screen.queryByText(/rh_desligamento/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'RH' }));
  await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('dashboard_activity', expect.objectContaining({ p_categoria: 'rh', p_limit: 12 })));
 });
 it('keeps unresolved requests in loading state', () => {
  rpc.mockReturnValue(new Promise(() => {})); mount();
  expect(screen.queryByText('Nenhuma atividade registrada ainda.')).toBeNull();
  expect(screen.queryByRole('list')).toBeNull();
 });
});
