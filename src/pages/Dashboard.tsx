import { QUEUE_ERROR_LABELS } from "@/lib/queueErrorLabels";
import { Button } from "@/components/ui/button";
import QueryState from "@/components/QueryState";
import { completedQueueLink } from "@/lib/dashboardFilters";
import PeopleLifecycleChart from "@/components/PeopleLifecycleChart";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, AlertTriangle, Bot, CalendarClock, ClipboardCheck, FileCheck, KeyRound,
  ShieldAlert, ShieldCheck, UserCheck, Users, XCircle, Crown, FileSpreadsheet, Hourglass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { useDashboardMetrics, useDashboardSeries, useParametro, type DashboardSeriesPoint } from "@/hooks/useOrigoData";
import { actionLabel, QUEUE_STATUS_META } from "@/lib/queueLabels";
import ActivityFeed from "@/components/ActivityFeed";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingDown, TrendingUp } from "lucide-react";

function useDashboardKpis(days: number) {
  return useQuery({
    queryKey: ["dashboard_kpis", days],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("dashboard_kpis", { p_days: days });
      if (error) throw error;
      return data as Row;
    },
    staleTime: 15_000,
  });
}

/* ── cartão de indicador com variação e mini-gráfico ── */
function KpiCard({ label, value, prev, spark, color, to, hint, invert }: { label: string; value: number; prev?: number; spark?: number[]; color: string; to: string; hint?: string; invert?: boolean }) {
  const delta = prev === undefined ? null : prev === 0 ? (value > 0 ? 100 : 0) : Math.round(((value - prev) / prev) * 100);
  const good = delta === null ? true : invert ? delta <= 0 : delta >= 0;
  const data = (spark ?? []).map((v, i) => ({ i, v }));
  return (
    <Link to={to} className="group">
      <Card className="h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:border-primary/40">
        <CardContent className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <span className="text-3xl font-semibold tabular-nums">{value.toLocaleString("pt-BR")}</span>
            {delta !== null && (
              <span className={`flex items-center gap-0.5 text-xs font-medium ${good ? "text-success" : "text-destructive"}`}>
                {delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{delta > 0 ? "+" : ""}{delta}%
              </span>
            )}
          </div>
          {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
          {data.length > 1 && (
            <div className="-mx-4 -mb-4 mt-2 h-10">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
                  <defs><linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                  <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#g-${label})`} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── uso de licenças ── */
function LicensesPanel({ rows }: { rows: { nome: string; total: number; em_uso: number }[] }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">Licenças em uso</CardTitle><Link to="/licencas" className="text-xs text-primary hover:underline">Ver todas</Link></div></CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <EmptyState message="Sem licenças sincronizadas." /> : rows.map((r) => {
          const pct = r.total > 0 ? Math.round((r.em_uso / r.total) * 100) : 0;
          const tone = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-primary";
          return (
            <div key={r.nome} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate" title={r.nome}>{r.nome}</span><span className="shrink-0 text-xs text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{r.em_uso}</span>/{r.total} · {pct}%</span></div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const C = {
  success: "hsl(142, 71%, 45%)",
  destructive: "hsl(0, 84%, 60%)",
  info: "hsl(199, 89%, 48%)",
  warning: "hsl(38, 92%, 50%)",
  primary: "hsl(176, 74%, 34%)",
  muted: "hsl(215, 16%, 47%)",
  violet: "hsl(262, 52%, 47%)",
};

const FAILURE_LABELS = QUEUE_ERROR_LABELS;

type Period = 7 | 30 | 90;

function fmtDay(iso: string) { const [, m, d] = iso.split("-"); return `${d}/${m}`; }
function relTime(iso?: string | null) {
  if (!iso) return "nunca";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
function ageLabel(iso?: string | null) {
  if (!iso) return null;
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return "< 1 h";
  if (h < 48) return `${Math.floor(h)} h`;
  return `${Math.floor(h / 24)} d`;
}

function ChartTooltip({ active, payload, label }: Row) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-3 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: Row) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</span>
          <span className="font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── status do sistema (agente, base RH, aprovação) ── */
function SystemStrip({ m, loading }: { m: Row; loading: boolean }) {
  const approval = useParametro("iam_approval_required", "true") === "true";
  const agent: Row = m?.agente?.[0];
  const agentAge = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;
  const agentOnline = agentAge < 5;
  const agentWarn = !agentOnline && agentAge < 30;
  const csv: Row = m?.ultimo_csv;
  const items = [
    {
      icon: Bot, label: "Agente executor",
      value: loading ? "…" : !agent ? "nunca visto" : agentOnline ? "online" : agentWarn ? "sem sinal" : "offline",
      hint: agent ? `${agent.execute_mode === false ? "simulação" : "execução ativa"} · ${relTime(agent.last_seen_at)}` : "sem heartbeat",
      tone: !agent || (!agentOnline && !agentWarn) ? "destructive" : agentWarn ? "warning" : "success",
      to: "/fila-provisionamento",
    },

    {
      icon: FileSpreadsheet, label: "Base do RH",
      value: loading ? "…" : !csv ? "nenhuma" : csv.display_status === "collected_not_imported" ? "coletada; não importada" : csv.status === "running" ? "importando" : csv.status === "done" ? `${csv.colab_created ?? 0} novos · ${csv.colab_updated ?? 0} alt.` : "falhou",
      hint: csv ? `${csv.filename || "RH_COLAB"} · ${relTime(csv.source_modified_at || csv.updated_at)}` : "sem arquivo",
      tone: !csv || csv.display_status === "collected_not_imported" ? "warning" : csv.status === "error" ? "destructive" : "info",
      to: "/configuracoes/integracoes",
    },
    {
      icon: approval ? ShieldCheck : ShieldAlert, label: "Aprovação",
      value: approval ? "obrigatória" : "direta",
      hint: approval ? "antes da execução" : "sem etapa de aprovação",
      tone: approval ? "success" : "warning",
      to: "/fila-provisionamento?tab=aprovacao",
    },
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map((it) => (
        <Link key={it.label} to={it.to} className="group">
          <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                it.tone === "success" ? "bg-success/10 text-success" : it.tone === "destructive" ? "bg-destructive/10 text-destructive" : it.tone === "warning" ? "bg-warning/10 text-warning" : "bg-info/10 text-info"}`}>
                <it.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{it.label}</p>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className={`h-1.5 w-1.5 rounded-full ${it.tone === "success" ? "bg-success" : it.tone === "destructive" ? "bg-destructive" : it.tone === "warning" ? "bg-warning" : "bg-info animate-pulse"}`} />
                  {it.value}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{it.hint}</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/* ── barras horizontais clicáveis ── */
function BarsPanel({ title, rows, unit, footer }: { title: string; rows: { label: string; value: number; color: string; to?: string; includeInTotal?: boolean }[]; unit?: string; footer?: React.ReactNode }) {
  const total = rows.reduce((s, r) => s + (r.includeInTotal === false ? 0 : r.value), 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="h-full">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between border-b pb-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total</span>
          <span aria-label={`${title}: total`} className="text-xl font-semibold tabular-nums">{total}</span>
        </div>
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          const width = r.value > 0 ? Math.max(3, Math.round((r.value / max) * 100)) : 0;
          const inner = (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} /><span className="truncate" title={r.label}>{r.label}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground"><span className="font-semibold text-foreground tabular-nums">{r.value}</span>{unit ? ` ${unit}` : ""} · {pct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, backgroundColor: r.color }} /></div>
            </div>
          );
          return r.to ? <Link key={r.label} to={r.to} className="block rounded-md p-1 -m-1 hover:bg-muted/50">{inner}</Link> : <div key={r.label}>{inner}</div>;
        })}
        {footer}
      </CardContent>
    </Card>
  );
}

/* ── pendências de governança ── */
function GovernanceList({ m, loading }: { m: Row; loading: boolean }) {
  const items: { icon: typeof Users; label: string; value: number; to: string; tone: "warning" | "destructive" | "info" | "muted" }[] = [
    { icon: FileCheck, label: "Exceções pendentes", value: m?.excecoes_pendentes ?? 0, to: "/excecoes", tone: "warning" },
    { icon: CalendarClock, label: "Exceções vencendo", value: m?.excecoes_vencendo ?? 0, to: "/excecoes", tone: "info" },
    { icon: ClipboardCheck, label: "Revisões abertas", value: m?.revisoes_abertas ?? 0, to: "/revisoes", tone: "info" },
    { icon: Hourglass, label: "Revisões atrasadas", value: m?.revisoes_atrasadas ?? 0, to: "/revisoes", tone: "destructive" },
    { icon: UserCheck, label: "Contratos vencidos", value: m?.terc_vencidos ?? 0, to: "/terceiros", tone: "destructive" },
    { icon: CalendarClock, label: "Contratos vencendo", value: m?.terc_vencendo_30d ?? 0, to: "/terceiros", tone: "warning" },
    { icon: UserCheck, label: "Terceiros a revalidar", value: m?.terc_revalidar ?? 0, to: "/terceiros", tone: "warning" },
    { icon: ShieldAlert, label: "Conflitos de acesso (SoD)", value: m?.sod_violacoes ?? 0, to: "/sod", tone: "destructive" },
    { icon: KeyRound, label: "Licenças críticas", value: m?.licencas_criticas ?? 0, to: "/licencas", tone: "warning" },
    { icon: Users, label: "Contas órfãs no Entra", value: m?.fila_orfaos ?? 0, to: "/fila-provisionamento?tab=aprovacao&action=review_orphan_entra", tone: "warning" },
    { icon: FileSpreadsheet, label: "RH: precisa de você", value: m?.quarentena ?? 0, to: "/colaboradores/quarentena", tone: "warning" },
    { icon: Users, label: "Ativos sem conta Entra", value: m?.colab_sem_entra ?? 0, to: "/colaboradores?status=ativo", tone: "info" },
    { icon: Users, label: "Ativos sem cargo", value: m?.colab_sem_cargo ?? 0, to: "/colaboradores?status=ativo", tone: "muted" },
    { icon: Crown, label: "Acessos privilegiados", value: m?.priv_membros ?? 0, to: "/privilegiados", tone: "muted" },
  ];
  const open = items.filter((i) => i.value > 0);
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Pendências de governança</CardTitle>
          <Badge variant="outline" className="text-xs">{open.length} tema(s)</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : open.length === 0 ? (
          <div className="py-10"><EmptyState message="Nenhuma pendência — tudo em dia." /></div>
        ) : (
          <ul className="divide-y">
            {open.map((i) => (
              <li key={i.label}>
                <Link to={i.to} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/50">
                  <i.icon className={`h-4 w-4 shrink-0 ${i.tone === "destructive" ? "text-destructive" : i.tone === "warning" ? "text-warning" : i.tone === "info" ? "text-info" : "text-muted-foreground"}`} />
                  <span className="flex-1 truncate" title={i.label}>{i.label}</span>
                  <Badge variant="outline" className={`tabular-nums ${i.tone === "destructive" ? "border-destructive/30 bg-destructive/10 text-destructive" : i.tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : ""}`}>{i.value}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ── main ── */
export default function Dashboard() {
  const [period, setPeriod] = useState<Period>(30);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { data: m, isLoading, error: metricsError, refetch: retryMetrics } = useDashboardMetrics();
  const { data: series, isLoading: seriesLoading, error: seriesError, refetch: retrySeries, isPlaceholderData: seriesPlaceholder } = useDashboardSeries(period);

  const chartData = useMemo(() => (series ?? []).map((p: DashboardSeriesPoint) => ({ ...p, label: fmtDay(p.dia) })), [series]);
  const totals = useMemo(() => (series ?? []).reduce((acc, p) => ({
    concessoes: acc.concessoes + p.concessoes, revogacoes: acc.revogacoes + p.revogacoes, falhas: acc.falhas + p.falhas,
    joiners: acc.joiners + p.joiners, movers: acc.movers + p.movers, leavers: acc.leavers + p.leavers,
  }), { concessoes: 0, revogacoes: 0, falhas: 0, joiners: 0, movers: 0, leavers: 0 }), [series]);
  const toggle = (key: string) => setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const tick = period === 7 ? 0 : period === 30 ? 4 : 14;

  const { data: k } = useDashboardKpis(period);
  const pessoas = (m?.colab_ativos ?? 0) + (m?.colab_ferias ?? 0) + (m?.colab_afastados ?? 0) + (m?.terc_ativos ?? 0);
  const waitingAge = ageLabel(m?.fila_oldest_waiting);
  const pendingAge = ageLabel(m?.fila_oldest_pending);

  const kpis = [
    { label: "Aguardando aprovação", value: m?.fila_waiting ?? 0, hint: waitingAge ? `mais antigo: ${waitingAge}` : "nada pendente", icon: ShieldCheck, tone: (m?.fila_waiting ?? 0) > 0 ? "warning" as const : "success" as const, to: "/fila-provisionamento?tab=aprovacao" },
    { label: "Falhas do agente", value: m?.fila_failed ?? 0, hint: `${m?.fila_success_24h ?? 0} concluídos em 24 h${pendingAge ? ` · espera: ${pendingAge}` : ""}`, icon: XCircle, tone: (m?.fila_failed ?? 0) > 0 ? "destructive" as const : "success" as const, to: "/fila-provisionamento?status=failed" },
    { label: "Revisões abertas", value: m?.revisoes_abertas ?? 0, hint: `${pessoas} pessoas ativas`, icon: Users, tone: "primary" as const, to: "/revisoes" },
    { label: "Terceiros vencidos", value: m?.terc_vencidos ?? 0, hint: `${m?.excecoes_pendentes ?? 0} exceções pendentes`, icon: FileCheck, tone: (m?.terc_vencidos ?? 0) > 0 ? "destructive" as const : "success" as const, to: "/terceiros" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Início"
        description={<>Operação IAM em tempo real{m?.gerado_em ? <span className="text-xs"> · atualizado {relTime(m.gerado_em)}</span> : null}</>}
        actions={<><Button asChild variant="outline" size="sm"><Link to="/relatorios">Relatórios</Link></Button><Badge variant="outline" className="gap-1 text-xs"><Activity className={`h-3 w-3 ${metricsError || seriesError ? "text-destructive" : "text-success"}`} />{metricsError || seriesError ? "Dados indisponíveis" : isLoading ? "Carregando" : "Tempo real"}</Badge></>}
      />

      <QueryState loading={isLoading} error={metricsError || (!isLoading && !m ? new Error("Métricas indisponíveis") : null)} retry={retryMetrics}>
      <SystemStrip m={m} loading={isLoading} />

      {/* KPIs */}
      <div data-tour="kpi-cards" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Pessoas ativas" value={k?.pessoas_ativas ?? pessoas} color={C.primary} to="/colaboradores?status=ativo" hint={`${k?.admissoes ?? 0} admissões · ${k?.desligamentos ?? 0} desligamentos em ${period} d`} spark={(series ?? []).map((p) => p.joiners - p.leavers)} />
        <KpiCard label={`Execuções em ${period} d`} value={k?.execucoes ?? 0} prev={k?.execucoes_prev} color={C.success} to="/fila-provisionamento?status=success" hint="vs período anterior" spark={(series ?? []).map((p) => p.concessoes + p.revogacoes)} />
        <KpiCard label="Aguardando aprovação" value={k?.aguardando ?? m?.fila_waiting ?? 0} color={C.warning} to="/fila-provisionamento?tab=aprovacao" hint={waitingAge ? `mais antigo: ${waitingAge}` : "nada pendente"} />
        <KpiCard label="Falhas em 24 h" value={k?.falhas_24h ?? 0} prev={k?.falhas_prev} invert color={C.destructive} to="/fila-provisionamento?status=failed" hint="vs 24 h anteriores" spark={(series ?? []).map((p) => p.falhas)} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: "Revisões abertas", v: k?.revisoes_abertas ?? 0, to: "/revisoes", icon: ClipboardCheck },
          { l: "Exceções vencendo (7 d)", v: k?.excecoes_vencendo ?? 0, to: "/excecoes", icon: CalendarClock },
          { l: "Terceiros vencidos", v: k?.terceiros_vencidos ?? 0, to: "/terceiros", icon: UserCheck },
          { l: "RH: precisa de você", v: k?.quarentena ?? 0, to: "/colaboradores/quarentena", icon: FileSpreadsheet },
        ].map((x) => (
          <Link key={x.l} to={x.to}><Card className="transition-colors hover:border-primary/40"><CardContent className="flex items-center gap-3 p-3"><x.icon className={`h-4 w-4 ${x.v > 0 ? "text-warning" : "text-muted-foreground"}`} /><span className="flex-1 truncate text-sm">{x.l}</span><span className="text-lg font-semibold tabular-nums">{x.v}</span></CardContent></Card></Link>
        ))}
      </div>

      </QueryState>
      {/* Séries */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
        <div className="h-full"><QueryState loading={seriesLoading || seriesPlaceholder} error={seriesError} retry={retrySeries}>
        <Card data-tour="chart-requests" className="min-h-[360px] flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3"><div><CardTitle className="text-base">Execuções por dia</CardTitle>
            <p className="text-xs text-muted-foreground">Concessões, revogações e falhas executadas pelo agente</p></div>
            <div className="flex gap-1">{([7, 30, 90] as Period[]).map((d) => <Button key={d} size="sm" variant={period === d ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setPeriod(d)}>{d} d</Button>)}</div></div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col pt-0">
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/40 px-3 py-2"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Concessões</p><p className="text-lg font-semibold tabular-nums text-success">{totals.concessoes}</p></div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Revogações</p><p className="text-lg font-semibold tabular-nums">{totals.revogacoes}</p></div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Falhas</p><p className="text-lg font-semibold tabular-nums text-destructive">{totals.falhas}</p></div>
            </div>
            <div className="min-h-[230px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: -16, right: 8, top: 8 }} barCategoryGap={period === 7 ? "30%" : "15%"}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" interval={tick} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend onClick={(e: Row) => toggle(String(e.dataKey))} wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
                <Bar dataKey="concessoes" name="Concessões" stackId="x" fill={C.success} hide={hidden.has("concessoes")} />
                <Bar dataKey="revogacoes" name="Revogações" stackId="x" fill={C.muted} hide={hidden.has("revogacoes")} />
                <Bar dataKey="falhas" name="Falhas" stackId="x" fill={C.destructive} radius={[3, 3, 0, 0]} hide={hidden.has("falhas")} />
              </BarChart>
            </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        </QueryState></div>
        </div>
        <BarsPanel title="Pessoas por situação" unit="pessoas" rows={[
          { label: "Ativos", value: m?.colab_ativos ?? 0, color: C.success, to: "/colaboradores?status=ativo" },
          { label: "Férias", value: m?.colab_ferias ?? 0, color: C.info, to: "/colaboradores?status=ferias" },
          { label: "Afastados", value: m?.colab_afastados ?? 0, color: C.warning, to: "/colaboradores?status=afastado" },
          { label: "Terceiros ativos", value: m?.terc_ativos ?? 0, color: C.violet, to: "/terceiros" },
        ]} />
      </div>

      {/* Movimentações e licenças */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Movimentações de pessoas</CardTitle><p className="text-xs text-muted-foreground">Admissões, mudanças e desligamentos por dia ({totals.joiners} · {totals.movers} · {totals.leavers})</p></CardHeader>
          <CardContent className="h-[240px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" interval={tick} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="joiners" name="Admissões" stroke={C.success} fill={C.success} fillOpacity={0.15} />
                <Area type="monotone" dataKey="movers" name="Mudanças" stroke={C.info} fill={C.info} fillOpacity={0.15} />
                <Area type="monotone" dataKey="leavers" name="Desligamentos" stroke={C.destructive} fill={C.destructive} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <LicensesPanel rows={k?.licencas ?? []} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <GovernanceList m={m} loading={isLoading} />
      {/* Atividade recente */}
      <Card data-tour="timeline" className="animate-content-in stagger-5 lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Atividade recente</CardTitle>
            <div className="flex gap-3 text-xs">
              <Link to="/fila-provisionamento" className="text-primary hover:underline">Fila</Link>
              <Link to="/eventos-jml" className="text-primary hover:underline">Eventos JML</Link>
              <Link to="/auditoria" className="text-primary hover:underline">Auditoria</Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ActivityFeed limit={10} />
        </CardContent>
      </Card>
      </div>
      <OnboardingTour pageKey="dashboard" steps={tourSteps.dashboard} />
    </div>
  );
}

