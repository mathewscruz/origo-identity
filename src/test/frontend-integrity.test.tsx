import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import QueryState from '@/components/QueryState';
import { completedQueueLink, queueStatuses, isPreventivelySuspended } from '@/lib/dashboardFilters';

describe('read states and dashboard drilldowns', () => {
  it('never renders empty data or zero children after a read failure', () => {
    render(<QueryState error={new Error('RPC missing')} loading={false}><span>0 pessoas</span></QueryState>);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('0 pessoas')).toBeNull(); cleanup();
  });
  it('distinguishes loading from confirmed empty', () => {
    const view = render(<QueryState loading><span>Nenhum registro</span></QueryState>);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('Nenhum registro')).toBeNull();
    view.rerender(<QueryState loading={false}><span>Nenhum registro</span></QueryState>);
    expect(screen.getByText('Nenhum registro')).toBeTruthy(); cleanup();
  });
  it('uses both executable statuses, suspension flag independent of HR status and processed dates', () => {
    expect(queueStatuses('agente')).toEqual(['pending', 'processing']);
    expect(isPreventivelySuspended({ status: 'ativo', suspenso_preventivo: false })).toBe(false);
    expect(isPreventivelySuspended({ status: 'afastado', suspenso_preventivo: true })).toBe(true);
    const url = new URL(completedQueueLink('2026-09-17T21:00:00Z'), 'https://test');
    expect(url.searchParams.get('processed_from')).toBe('2026-09-10T21:00:00.000Z');
    expect(url.searchParams.get('status')).toBe('success');
  });
});
