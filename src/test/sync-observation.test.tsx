import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { isSyncObservation } from '@/lib/syncObservation';
import IndividualAccessTabs from '@/pages/colaboradores/sections/IndividualAccessTabs';
afterEach(cleanup);
const imported = { id: 'fixture-existing', action_type: 'assign_license', requested_by: 'entra_sync', status: 'success', processed_by: null, result_message: 'Importado do Entra ID (já existente)', created_at: '2026-09-18T10:00:00Z', payload_json: {} };
describe('Sync inventory fixtures — not production operations', () => {
 it('first profile open observes existing rights without inventing a grant; repeat sync is still inventory', () => {
  expect([imported].filter(row => !isSyncObservation(row))).toHaveLength(0);
  expect([imported, { ...imported, id: 'fixture-repeat' }].filter(row => !isSyncObservation(row))).toHaveLength(0);
 });
 it('keeps genuinely executed grants, unknown records, pending work and manual requests', () => {
  for (const delta of [{ requested_by: 'manual_individual' }, { processed_by: 'executor-fixture' }, { result_message: 'Grant executed' }, { status: 'pending' }, { processed_by: undefined }]) {
   expect(isSyncObservation({ ...imported, ...delta })).toBe(false);
  }
 });
 it('recognizes exact sync absence observations without hiding real removals', () => {
  expect(isSyncObservation({ ...imported, action_type: 'remove_license', result_message: 'Correção de sync: recurso não está mais presente no Entra ID' })).toBe(true);
  expect(isSyncObservation({ ...imported, action_type: 'remove_license' })).toBe(false);
 });
 it('matches the deployed SQL classifier for confirmed Graph/catalog and inherited-group observations', () => {
  for (const result_message of ['Importado do Entra ID (licença ativa confirmada no Graph).', 'Importado do Entra ID (grupo faltante no catálogo).']) {
   expect(isSyncObservation({ ...imported, processed_by: '', result_message })).toBe(true);
  }
  for (const result_message of ['Correção de sync: recurso não está mais presente no Entra após ação Graph.', 'Correção de sync: grupo é transitivo/herdado, não associação direta gerenciável no usuário.']) {
   expect(isSyncObservation({ ...imported, action_type: 'remove_group', result_message })).toBe(true);
  }
 });
 it('keeps imported inventory visible but labels observation, not execution', () => {
  render(<IndividualAccessTabs individualQueue={[imported]} getResourceName={() => 'Existing fixture license'} onRevoke={vi.fn()} />);
  expect(screen.getByText('Existing fixture license')).toBeTruthy();
  expect(screen.getByText('Sincronizado do Entra ID')).toBeTruthy();
  expect(screen.getByText('Observado')).toBeTruthy();
  expect(screen.getByText(/Observado em/)).toBeTruthy();
  expect(screen.queryByText('Concluído')).toBeNull();
 });
 it('retains execution status for a genuinely new manual grant', () => {
  render(<IndividualAccessTabs individualQueue={[{ ...imported, requested_by: 'manual_individual', processed_by: 'executor-fixture', result_message: 'Grant executed' }]} getResourceName={() => 'New fixture license'} onRevoke={vi.fn()} />);
  expect(screen.getByText('Concluído')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Revogar' })).toBeTruthy();
  expect(screen.queryByText('Observado')).toBeNull();
 });
});
