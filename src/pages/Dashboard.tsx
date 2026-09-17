import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, AlertTriangle, Bot, CalendarClock, CheckCircle2, ClipboardCheck, Clock, FileCheck, KeyRound,
  Loader2, RefreshCw, ShieldAlert, ShieldCheck, UserCheck, Users, XCircle, Crown, FileSpreadsheet, Hourglass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { useDashboardMetrics, useDashboardSeries, useParametro, type DashboardSeriesPoint } from "@/hooks/useOrigoData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUEUE_ACTION_LABELS, QUEUE_STATUS_META } from "@/lib/queueLabels";
import ActivityFeed from "@/components/ActivityFeed";

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

type Period = 7 | 30 | 90;
const PERIODS: { value: Period; label: string }[] = [{ value: 7, label: "7 dias" }, { value: 30, label: "30 dias" }, { value: 90, label: "90 dias" }];

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

/* ── status do sistema (agente, ciclo, importação, aprovação) ── */
function SystemStrip({ m, loading }: { m: Row; loading: boolean }) {
  const approval = useParametro("iam_approval_required", "true") === "true";
  const agent: Row = m?.agente?.[0];
  const agentAge = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;
  const agentOnline = agentAge < 5;
  const agentWarn = !agentOnline && agentAge < 30;
  const ciclo: Row = m?.ultimo_ciclo;
  const csv: Row = m?.ultimo_csv;
  const items = [
    {
      icon: Bot, label: "Órigo Agente (executor)",
      value: loading ? "…" : !agent ? "nunca visto" : agentOnline ? "online" : agentWarn ? "sem sinal" : "offline",
      hint: agent ? `${agent.owner}${agent.version ? ` v${agent.version}` : ""} · ${agent.execute_mode === false ? "dry-run" : "executando"} · ${relTime(agent.last_seen_at)}` : "aguardando primeiro heartbeat",
      tone: !agent || (!agentOnline && !agentWarn) ? "destructive" : agentWarn ? "warning" : "success",
      to: "/fila-provisionamento",
    },
    {
      icon: RefreshCw, label: "Ciclo diário (RH → reconciliação)",
      value: loading ? "…" : !ciclo ? "nunca rodou" : ciclo.status === "running" ? "em andamento" : ciclo.status === "done" ? "concluído" : "falhou",
      hint: ciclo ? `${relTime(ciclo.updated_at)} · ${String(ciclo.message || "").slice(0, 60)}` : "agendado 06:30 UTC",
      tone: !ciclo ? "warning" : ciclo.status === "error" ? "destructive" : ciclo.status === "running" ? "info" : "success",
      to: "/configuracoes/integracoes",
    },
    {
      icon: FileSpreadsheet, label: "Última base do RH",
      value: loading ? "…" : !csv ? "nenhuma" : csv.status === "running" ? "importando" : csv.status === "done" ? `${csv.colab_created ?? 0} novos · ${csv.colab_updated ?? 0} alt.` : "falhou",
      hint: csv ? `${relTime(csv.updated_at)}${csv.filename ? ` · ${csv.filename}` : ""}` : "SharePoint RH_COLAB",
      tone: !csv ? "warning" : csv.status === "error" ? "destructive" : "info",
      to: "/configuracoes/integracoes",
    },
    {
      icon: approval ? ShieldCheck : ShieldAlert, label: "Aprovação obrigatória",
      value: approval ? "ligada" : "desligada",
      hint: approval ? "nada vai ao agente sem aprovação" : "itens vão direto para execução",
      tone: approval ? "success" : "warning",
      to: "/fila-provisionamento?tab=aprovacao",
    },
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
function BarsPanel({ title, rows, unit, footer }: { title: string; rows: { label: string; value: number; color: string; to?: string }[]; unit?: string; footer?: React.ReactNode }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="h-full">
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between border-b pb-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total</span>
          <span className="text-xl font-semibold tabular-nums">{total}</span>
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
    { icon: FileCheck, label: "Exceções pendentes de decisão", value: m?.excecoes_pendentes ?? 0, to: "/excecoes", tone: "warning" },
    { icon: CalendarClock, label: "Exceções vencendo em 15 dias", value: m?.excecoes_vencendo ?? 0, to: "/excecoes", tone: "info" },
    { icon: ClipboardCheck, label: "Revisões de acesso em aberto", value: m?.revisoes_abertas ?? 0, to: "/revisoes", tone: "info" },
    { icon: Hourglass, label: "Revisões com prazo vencido", value: m?.revisoes_atrasadas ?? 0, to: "/revisoes", tone: "destructive" },
    { icon: UserCheck, label: "Terceiros com contrato vencido", value: m?.terc_vencidos ?? 0, to: "/terceiros", tone: "destructive" },
    { icon: CalendarClock, label: "Terceiros vencendo em 30 dias", value: m?.terc_vencendo_30d ?? 0, to: "/terceiros", tone: "warning" },
    { icon: UserCheck, label: "Terceiros a revalidar", value: m?.terc_revalidar ?? 0, to: "/terceiros", tone: "warning" },
    { icon: ShieldAlert, label: "Violações de SoD (pessoas com perfis conflitantes)", value: m?.sod_violacoes ?? 0, to: "/sod", tone: "destructive" },
    { icon: KeyRound, label: "Licenças em nível crítico", value: m?.licencas_criticas ?? 0, to: "/licencas", tone: "warning" },
    { icon: Users, label: "Contas órfãs no Entra aguardando revisão", value: m?.fila_orfaos ?? 0, to: "/fila-provisionamento?tab=aprovacao&action=review_orphan_entra", tone: "warning" },
    { icon: FileSpreadsheet, label: "Linhas do RH em quarentena", value: m?.quarentena ?? 0, to: "/configuracoes/integracoes", tone: "warning" },
    { icon: Users, label: "Ativos sem conta vinculada no Entra", value: m?.colab_sem_entra ?? 0, to: "/colaboradores?status=ativo", tone: "info" },
    { icon: Users, label: "Ativos sem cargo (sem acesso por perfil)", value: m?.colab_sem_cargo ?? 0, to: "/colaboradores?status=ativo", tone: "muted" },
    { icon: Crown, label: "Pessoas com funções privilegiadas", value: m?.priv_membros ?? 0, to: "/privilegiados", tone: "muted" },
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
  const { data: m, isLoading } = useDashboardMetrics();
  const { data: series } = useDashboardSeries(period);

  const chartData = useMemo(() => (series ?? []).map((p: DashboardSeriesPoint) => ({ ...p, label: fmtDay(p.dia) })), [series]);
  const totals = useMemo(() => (series ?? []).reduce((acc, p) => ({
    concessoes: acc.concessoes + p.concessoes, revogacoes: acc.revogacoes + p.revogacoes, falhas: acc.falhas + p.falhas,
    joiners: acc.joiners + p.joiners, movers: acc.movers + p.movers, leavers: acc.leavers + p.leavers,
  }), { concessoes: 0, revogacoes: 0, falhas: 0, joiners: 0, movers: 0, leavers: 0 }), [series]);
  const toggle = (key: string) => setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const tick = period === 7 ? 0 : period === 30 ? 4 : 14;

  const pessoas = (m?.colab_ativos ?? 0) + (m?.colab_ferias ?? 0) + (m?.colab_afastados ?? 0) + (m?.terc_ativos ?? 0);
  const waitingAge = ageLabel(m?.fila_oldest_waiting);
  const pendingAge = ageLabel(m?.fila_oldest_pending);

  const kpis = [
    { label: "Pessoas ativas", value: pessoas, hint: `${m?.colab_ativos ?? 0} colab. · ${m?.terc_ativos ?? 0} terceiros · ${(m?.colab_ferias ?? 0) + (m?.colab_afastados ?? 0)} afastados/férias`, icon: Users, tone: "primary" as const, to: "/colaboradores" },
    { label: "Aguardando aprovação", value: m?.fila_waiting ?? 0, hint: waitingAge ? `mais antigo há ${waitingAge}` : "nada aguardando", icon: ShieldCheck, tone: (m?.fila_waiting ?? 0) > 0 ? "warning" as const : "success" as const, to: "/fila-provisionamento?tab=aprovacao" },
    { label: "Para o agente executar", value: (m?.fila_pending ?? 0) + (m?.fila_processing ?? 0), hint: `${m?.fila_processing ?? 0} em execução${pendingAge ? ` · mais antigo há ${pendingAge}` : ""}`, icon: Bot, tone: "info" as const, to: "/fila-provisionamento?status=pending" },
    { label: "Falhas na fila", value: m?.fila_failed ?? 0, hint: `${m?.fila_success_24h ?? 0} sucesso(s) nas últimas 24 h`, icon: XCircle, tone: (m?.fila_failed ?? 0) > 0 ? "destructive" as const : "success" as const, to: "/fila-provisionamento?status=failed" },
    { label: "Exceções pendentes", value: m?.excecoes_pendentes ?? 0, hint: `${m?.excecoes_ativas ?? 0} ativa(s) · ${m?.excecoes_vencendo ?? 0} vencendo em 15 d`, icon: FileCheck, tone: (m?.excecoes_pendentes ?? 0) > 0 ? "warning" as const : "success" as const, to: "/excecoes" },
    { label: "Alertas não lidos", value: m?.alertas_nao_lidos ?? 0, hint: `${m?.alertas_criticos ?? 0} crítico(s)`, icon: AlertTriangle, tone: (m?.alertas_criticos ?? 0) > 0 ? "destructive" as const : (m?.alertas_nao_lidos ?? 0) > 0 ? "warning" as const : "success" as const, to: "/alertas" },
  ];

  const pessoasRows = [
    { label: "Ativos", value: m?.colab_ativos ?? 0, color: C.success, to: "/colaboradores?status=ativo" },
    { label: "Férias", value: m?.colab_ferias ?? 0, color: C.info, to: "/colaboradores?status=ferias" },
    { label: "Afastados", value: m?.colab_afastados ?? 0, color: C.warning, to: "/colaboradores?status=afastado" },
    { label: "Inativos", value: m?.colab_inativos ?? 0, color: C.muted, to: "/colaboradores?status=inativo" },
    { label: "Desligados", value: m?.colab_desligados ?? 0, color: C.destructive, to: "/colaboradores?status=desligado" },
    { label: "Terceiros ativos", value: m?.terc_ativos ?? 0, color: C.violet, to: "/terceiros" },
    { label: "Suspensos (pré-leaver)", value: m?.colab_suspensos ?? 0, color: "hsl(24, 90%, 55%)", to: "/colaboradores?status=ativo" },
  ];
  const filaRows = [
    { label: QUEUE_STATUS_META.waiting_approval.label, value: m?.fila_waiting ?? 0, color: C.info, to: "/fila-provisionamento?tab=aprovacao" },
    { label: QUEUE_STATUS_META.pending.label, value: m?.fila_pending ?? 0, color: C.warning, to: "/fila-provisionamento?status=pending" },
    { label: QUEUE_STATUS_META.processing.label, value: m?.fila_processing ?? 0, color: C.violet, to: "/fila-provisionamento?status=processing" },
    { label: QUEUE_STATUS_META.failed.label, value: m?.fila_failed ?? 0, color: C.destructive, to: "/fila-provisionamento?status=failed" },
    { label: "Concluídos (7 dias)", value: m?.fila_success_7d ?? 0, color: C.success, to: "/fila-provisionamento?status=success" },
  ];
  const acoes: Row[] = m?.fila_por_acao_7d ?? [];
  const falhas: Row[] = m?.fila_falhas_por_codigo ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={<>Visão operacional do IAM/IGA em tempo real{m?.gerado_em ? <span className="text-xs"> · atualizado {relTime(m.gerado_em)}</span> : null}</>}
        actions={<Badge variant="outline" className="gap-1 text-xs"><Activity className="h-3 w-3 text-success" />Tempo real</Badge>}
      />

      <SystemStrip m={m} loading={isLoading} />

      {/* KPIs */}
      <div data-tour="kpi-cards" className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k, i) => (
          <div key={k.label} className={`animate-content-in stagger-${i + 1}`}>
            <StatCard label={k.label} value={k.value} hint={k.hint} icon={k.icon} tone={k.tone} to={k.to} loading={isLoading} />
          </div>
        ))}
      </div>

      {/* Séries */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card data-tour="chart-provisioning" className="xl:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Atividade da fila de provisionamento</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {totals.concessoes} concessões · {totals.revogacoes} revogações · {totals.falhas} falhas no período{m?.fila_tempo_medio_min ? ` · tempo médio aprovação→execução ${m.fila_tempo_medio_min} min` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {PERIODS.map((p) => (
                  <Button key={p.value} size="sm" variant={period === p.value ? "default" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setPeriod(p.value)}>{p.label}</Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ left: -16, right: 8, top: 8 }}>
                <defs>
                  {[["g1", C.success], ["g2", C.destructive], ["g3", C.info], ["g4", C.warning]].map(([id, color]) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.35} /><stop offset="95%" stopColor={color} stopOpacity={0} /></linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" interval={tick} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend onClick={(e: Row) => toggle(String(e.dataKey))} wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
                <Area type="monotone" dataKey="concessoes" name="Concessões" stroke={C.success} fill="url(#g1)" strokeWidth={2} hide={hidden.has("concessoes")} />
                <Area type="monotone" dataKey="revogacoes" name="Revogações" stroke={C.destructive} fill="url(#g2)" strokeWidth={2} hide={hidden.has("revogacoes")} />
                <Area type="monotone" dataKey="outros" name="Contas/atributos" stroke={C.info} fill="url(#g3)" strokeWidth={2} hide={hidden.has("outros")} />
                <Area type="monotone" dataKey="falhas" name="Falhas" stroke={C.warning} fill="url(#g4)" strokeWidth={2} hide={hidden.has("falhas")} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-tour="chart-requests" className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Movimentações de pessoas (JML)</CardTitle>
            <p className="text-xs text-muted-foreground">{totals.joiners} entradas · {totals.movers} mudanças · {totals.leavers} saídas no período</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ left: -16, right: 8, top: 8 }} barCategoryGap={period === 7 ? "30%" : "15%"}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" interval={tick} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend onClick={(e: Row) => toggle(String(e.dataKey))} wrapperStyle={{ fontSize: 12, cursor: "pointer" }} />
                <Bar dataKey="joiners" name="Joiner" stackId="jml" fill={C.success} hide={hidden.has("joiners")} />
                <Bar dataKey="movers" name="Mover" stackId="jml" fill={C.info} hide={hidden.has("movers")} />
                <Bar dataKey="leavers" name="Leaver" stackId="jml" fill={C.destructive} radius={[3, 3, 0, 0]} hide={hidden.has("leavers")} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Distribuições + governança */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <BarsPanel title="Pessoas por status" rows={pessoasRows} />
        <BarsPanel title="Fila por status" rows={filaRows} />
        <Card className="h-full">
          <CardHeader className="pb-2"><CardTitle className="text-base">Ações dos últimos 7 dias</CardTitle></CardHeader>
          <CardContent className="p-0">
            {acoes.length === 0 ? <div className="py-8"><EmptyState message="Sem ações no período" /></div> : (
              <ul className="divide-y">
                {acoes.map((a) => {
                  const okPct = a.total > 0 ? Math.round((a.sucesso / a.total) * 100) : 0;
                  return (
                    <li key={a.acao} className="px-4 py-2">
                      <Link to={`/fila-provisionamento?action=${a.acao}`} className="block">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate">{QUEUE_ACTION_LABELS[a.acao] || a.acao}</span>
                          <span className="text-xs text-muted-foreground tabular-nums"><span className="font-semibold text-foreground">{a.total}</span>{a.falha > 0 ? <span className="text-destructive"> · {a.falha} falha(s)</span> : null}</span>
                        </div>
                        <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-success" style={{ width: `${okPct}%` }} />
                          <div className="h-full bg-destructive" style={{ width: `${a.total > 0 ? Math.round((a.falha / a.total) * 100) : 0}%` }} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {falhas.length > 0 && (
              <div className="border-t px-4 py-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Falhas em aberto por causa</p>
                <div className="flex flex-wrap gap-1.5">
                  {falhas.map((f) => (
                    <Link key={f.codigo} to="/fila-provisionamento?status=failed">
                      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{f.codigo} · {f.total}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <GovernanceList m={m} loading={isLoading} />
      </div>

      {/* Atividade recente — tudo o que aconteceu com pessoas e acessos (auditoria + fila + JML), em tempo real */}
      <Card data-tour="timeline" className="animate-content-in stagger-5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div><CardTitle className="text-base">Atividade recente</CardTitle><p className="text-xs text-muted-foreground">Criações, alterações, exclusões, atribuições e execuções — colaboradores e terceiros</p></div>
            <div className="flex gap-3 text-xs">
              <Link to="/fila-provisionamento" className="text-primary hover:underline">Fila</Link>
              <Link to="/eventos-jml" className="text-primary hover:underline">Eventos JML</Link>
              <Link to="/auditoria" className="text-primary hover:underline">Auditoria</Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ActivityFeed limit={15} />
        </CardContent>
      </Card>
      <OnboardingTour pageKey="dashboard" steps={tourSteps.dashboard} />
    </div>
  );
}

