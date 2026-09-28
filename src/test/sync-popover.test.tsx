import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const fixture = vi.hoisted(() => ({ queue: [] as Record<string, unknown>[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
 const result = { data: table === 'iam_queue' ? fixture.queue : [], error: null };
 const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve(result), single: () => Promise.resolve({ data: { sam_account_name: '' }, error: null }) };
 return chain;
} } }));
vi.mock('@/lib/resourceNames', () => ({ useResourceNameResolver: () => (row: { id: string }) => row.id }));
import ColaboradorActivityPopover from '@/components/ColaboradorActivityPopover';
afterEach(cleanup);
const imported = { id: 'existing-fixture', action_type: 'assign_license', requested_by: 'entra_sync', processed_by: null, status: 'success', created_at: '2026-09-18T10:00:00Z', processed_at: '2026-09-18T10:00:00Z', result_message: 'Importado do Entra ID (já existente)', payload_json: {} };
function mount() {
 render(<MemoryRouter><ColaboradorActivityPopover colaboradorId="fixture" colaboradorNome="Pessoa fixture" /></MemoryRouter>);
 fireEvent.click(screen.getByRole('button', { name: 'Atividades de Pessoa fixture' }));
}
describe('Legacy activity popover — fixture only', () => {
 it('does not turn first-open existing inventory into a grant activity', async () => {
  fixture.queue = [imported]; mount();
  await screen.findByText('Nenhuma atividade registrada.');
  expect(screen.queryByText('Licença atribuída')).toBeNull();
  expect(screen.queryByText(/executado/)).toBeNull();
 });
 it('retains a genuinely executed manual grant alongside imported inventory', async () => {
  fixture.queue = [imported, { ...imported, id: 'real-fixture', requested_by: 'manual_individual', processed_by: 'executor-fixture', result_message: 'Grant executed' }]; mount();
  await screen.findByText('real-fixture');
  expect(screen.getByText('Licença atribuída')).toBeTruthy();
  expect(screen.queryByText('existing-fixture')).toBeNull();
  expect(screen.getByRole('link').getAttribute('href')).toBe('/fila-provisionamento/real-fixture');
 });
});
