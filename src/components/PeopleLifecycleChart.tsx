import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import QueryState from '@/components/QueryState';
import { usePeopleSeries } from '@/hooks/usePeopleSeries';
import { PEOPLE_SERIES } from '@/lib/peopleActivity';
export function PeopleTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string | number; value?: number | string; name?: string }[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border bg-card p-3 text-xs shadow-lg"><p className="mb-1 font-medium">Dia {label} · America/Sao_Paulo</p>{payload.map(p => <p key={p.dataKey}>{p.name}: <strong>{p.value} {p.value === 1 ? 'pessoa' : 'pessoas'}</strong></p>)}</div>;
}
export default function PeopleLifecycleChart({ period, onPeriodChange }: { period: 7 | 30 | 90; onPeriodChange: (period: 7 | 30 | 90) => void }) {
  const { data, isLoading, error, refetch } = usePeopleSeries(period);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const totals = data?.reduce((a, p) => ({ entradas: a.entradas + p.entradas, saidas: a.saidas + p.saidas }), { entradas: 0, saidas: 0 });
  return <Card data-tour="chart-provisioning" className="xl:col-span-3">
    <CardHeader className="pb-2"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Entradas e saídas de pessoas</CardTitle><div className="flex gap-1">{([7, 30, 90] as const).map(days => <Button key={days} size="sm" variant={period === days ? 'default' : 'ghost'} onClick={() => onPeriodChange(days)}>{days} dias</Button>)}</div></div>
      <p className="text-xs text-muted-foreground">Pessoas distintas por dia e direção · últimos {period} dias · America/Sao_Paulo.</p>
      <p className="text-xs text-muted-foreground">Entrada: criação de conta confirmada. Saída: desligamento integral verificado, sem pendências obrigatórias. Bloqueio somente no AD/IAM não basta e não significa exclusão de conta.</p>
      <p className="text-xs text-muted-foreground">Licenças, grupos, aplicativos, sincronizações, cadastros e JML pendente não entram na contagem. Parciais continuam em Atividade recente. Sem evidência conclusiva, a ocorrência fica fora do gráfico.</p>
    </CardHeader>
    <CardContent><QueryState loading={isLoading} error={error} retry={refetch}>
      <p className="mb-3 text-sm">{totals?.entradas} entradas · {totals?.saidas} saídas no período (soma diária; a mesma pessoa pode reaparecer em outro dia).</p>
      <ResponsiveContainer width="100%" height={260}><AreaChart data={data} margin={{ left: -16, right: 24, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="dia" tickFormatter={d => `${d.slice(8, 10)}/${d.slice(5, 7)}`} interval={period === 7 ? 0 : period === 30 ? 4 : 14} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip content={<PeopleTooltip />} />
        {PEOPLE_SERIES.map(s => <Area key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color} fill={s.color} fillOpacity={0.12} strokeWidth={2} hide={hidden.has(s.key)} />)}
      </AreaChart></ResponsiveContainer>
      <div className="mt-3 flex justify-center gap-4" aria-label="Séries do gráfico">{PEOPLE_SERIES.map(s => <button type="button" key={s.key} aria-pressed={!hidden.has(s.key)} onClick={() => setHidden(prev => { const next = new Set(prev); if (next.has(s.key)) next.delete(s.key); else next.add(s.key); return next; })} className={`text-xs ${hidden.has(s.key) ? 'opacity-50 line-through' : ''}`}>{s.label}</button>)}</div>
    </QueryState></CardContent>
  </Card>;
}
