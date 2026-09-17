/* eslint-disable @typescript-eslint/no-explicit-any -- fluent Supabase/query-hook test doubles */
import { describe, it, expect, vi } from 'vitest';
const { from, query, result } = vi.hoisted(() => {
 const result = { data: [{ id: 'older-than-5000' }], count: 7948, error: null as unknown };
 const query: any = {};
 for (const method of ['select', 'order', 'range', 'eq', 'gte', 'ilike', 'in']) query[method] = vi.fn(() => query);
 query.then = (resolve: any) => Promise.resolve(result).then(resolve);
 return { from: vi.fn(() => query), query, result };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (opts: any) => opts, keepPreviousData: (x: any) => x }));
import { useEventosJMLPage, useQueuePage } from '@/hooks/useOrigoData';
describe('JML server pagination', () => {
 it('queries beyond 5000, exact global count and all filters on server', async () => {
  const options: any = useEventosJMLPage({ page: 241, pageSize: 25, search: 'Pessoa antiga', tipo: 'mover', origem: 'manual', since: '2026-01-01T00:00:00Z' });
  const data = await options.queryFn();
  expect(query.select).toHaveBeenCalledWith('*', { count: 'exact' });
  expect(query.range).toHaveBeenCalledWith(6000, 6024);
  expect(query.ilike).toHaveBeenCalledWith('colaborador_nome', '%Pessoa antiga%');
  expect(query.eq).toHaveBeenCalledWith('tipo', 'mover');
  expect(query.eq).toHaveBeenCalledWith('origem', 'manual');
  expect(query.gte).toHaveBeenCalledWith('created_at', '2026-01-01T00:00:00Z');
  expect(data.total).toBe(7948);
 });
 it('queue drilldown applies both statuses and processed timestamp, never creation timestamp', async () => {
  const options: any = useQueuePage({ page: 1, pageSize: 25, status: ['pending','processing'], processedFrom: '2026-09-10T21:00:00Z' });
  await options.queryFn();
  expect(query.in).toHaveBeenCalledWith('status', ['pending','processing']);
  expect(query.gte).toHaveBeenCalledWith('processed_at', '2026-09-10T21:00:00Z');
  expect(options.queryKey).toContain('2026-09-10T21:00:00Z');
 });
 it('propagates failures rather than returning zero', async () => {
  result.error = new Error('offline');
  await expect((useEventosJMLPage({page: 1, pageSize: 25}) as any).queryFn()).rejects.toThrow('offline');
  result.error = null;
 });
});
