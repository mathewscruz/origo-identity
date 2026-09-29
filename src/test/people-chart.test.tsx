import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock('@/hooks/usePeopleSeries', () => ({ usePeopleSeries: () => ({ data: [{ dia: '2026-09-18', entradas: 1, saidas: 0 }], isLoading: false, error: state.error, refetch: vi.fn() }) }));
vi.mock('recharts', () => ({
 ResponsiveContainer: ({ children }: {children: ReactNode}) => <div>{children}</div>,
 AreaChart: ({ children }: {children: ReactNode}) => <div>{children}</div>,
 Area: ({ dataKey, name, hide }: {dataKey: string; name: string; hide: boolean}) => <div data-testid="area" data-key={dataKey} data-hidden={String(hide)}>{name}</div>,
 CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
}));
import PeopleLifecycleChart, { PeopleTooltip } from '@/components/PeopleLifecycleChart';
afterEach(() => { cleanup(); state.error = null; });
it('renders exactly two actual chart series and toggles only people counts', () => {
 const change = vi.fn();render(<PeopleLifecycleChart period={30} onPeriodChange={change} />);
 expect(screen.getAllByTestId('area').map(e => e.getAttribute('data-key'))).toEqual(['entradas', 'saidas']);
 expect(screen.getByText(/1 entrada · 0 saídas/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Entradas' }));
 expect(screen.getAllByTestId('area')[0].getAttribute('data-hidden')).toBe('true');
 fireEvent.click(screen.getByRole('button', { name: '7 dias' }));expect(change).toHaveBeenCalledWith(7);
 expect(screen.getByText(/Eventos confirmados/)).toBeTruthy();
 expect(screen.queryByText(/Licenças, grupos, aplicativos/)).toBeNull();
});
it('tooltip names people, full day and timezone', () => {
 render(<PeopleTooltip active label="2026-09-18" payload={[{dataKey:'entradas',name:'Entradas',value:1},{dataKey:'saidas',name:'Saídas',value:2}]} />);
 expect(screen.getByText('Dia 2026-09-18 · America/Sao_Paulo')).toBeTruthy();
 expect(screen.getByText('1 pessoa')).toBeTruthy();expect(screen.getByText('2 pessoas')).toBeTruthy();
});
it('RPC failure does not render successful-looking zero series', () => {
 state.error = new Error('People RPC unavailable');render(<PeopleLifecycleChart period={30} onPeriodChange={vi.fn()} />);
 expect(screen.queryAllByTestId('area')).toHaveLength(0);
 expect(screen.queryByText(/1 entradas · 0 saídas/)).toBeNull();
});
