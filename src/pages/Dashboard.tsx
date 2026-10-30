import { AutoUpdatedHint } from "@/components/AutoUpdatedHint";
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
  AlertTriangle, CalendarClock, ClipboardCheck, FileCheck, KeyRound,
  ShieldAlert, ShieldCheck, UserCheck, Users, XCircle, Crown, FileSpreadsheet, Hourglass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { useDashboardMetrics, useDashboardSeries, type DashboardSeriesPoint } from "@/hooks/useOrigoData";
import { actionLabel, QUEUE_STATUS_META } from "@/lib/queueLabels";
import ActivityFeed from "@/components/ActivityFeed";
import { useQuery } from "@tanstack/react-query";
import { usePeopleSeries } from "@/hooks/usePeopleSeries";
import { splitPeriods } from "@/lib/peopleActivity";
import { supabase } from "@/integrations/supabase/client";
import { Play, Clock, AlertCircle, Shield, ChevronRight, ChevronDown, Box, Activity, Minus } from "lucide-react";
import ProductLogo from "@/components/ProductLogo";
import { useActivityFeed, acaoIcon } from "@/components/ActivityFeed";
import { activitySentence, isActivityNoise } from "@/lib/activityLabels";
import { tempoRelativo } from "@/lib/alertLabels";
import { useAuth } from "@/contexts/AuthContext";
import { useAvatarUrl } from "@/lib/avatarUrl";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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

/* ── uso de licenças ── */
function LicensesPanel({ rows }: { rows: { nome: string; total: number; em_uso: number }[] }) {
  return (
    <Card className="flex h-full flex-col rounded-xl">
      <CardTitleRow icon={Box} title="Licenças em uso" action={<Link to="/licencas" className="text-xs text-primary hover:underline">Ver todas</Link>} />
      <CardContent className="flex flex-1 flex-col justify-between gap-4 px-5 pb-5 pt-0">
        {rows.length === 0 ? <EmptyState message="Sem licenças sincronizadas." /> : rows.map((r) => {
          const pct = r.total > 0 ? Math.round((r.em_uso / r.total) * 100) : 0;
          return (
            <Link key={r.nome} to="/licencas" className="flex items-center gap-4 hover:opacity-90" title={`${r.em_uso} de ${r.total}`}>
              <ProductLogo nome={r.nome} />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block truncate text-sm" title={r.nome}>{r.nome}</span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} /></div>
              </div>
              <span className="w-11 text-right text-sm font-medium tabular-nums text-primary">{pct}%</span>
            </Link>
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

/* ── linha discreta de status (só ganha cor quando há problema) ── */
function SystemStrip({ m, loading }: { m: Row; loading: boolean }) {
  if (loading) return null;
  const agent: Row = m?.agente?.[0];
  const agentAge = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;
  const agentBad = agentAge > 10;
  const csv: Row = m?.ultimo_csv;
  const csvAt = csv ? new Date(csv.source_modified_at || csv.updated_at).getTime() : 0;
  const csvBad = !csv || csv.status === "error" || csv.display_status === "collected_not_imported" || (Date.now() - csvAt) / 3600000 > 26;
  const csvText = !csv ? "Base do RH sem arquivo"
    : csv.status === "error" ? "Base do RH falhou"
    : csv.status === "running" ? "Base do RH importando"
    : `Base do RH atualizada ${relTime(csv.source_modified_at || csv.updated_at)}${csv.colab_updated || csv.colab_created ? ` (${(csv.colab_created ?? 0) + (csv.colab_updated ?? 0)} alterações)` : ""}`;
  const part = (bad: boolean, text: string, to: string) => (
    <Link to={to} className={`inline-flex items-center gap-1.5 hover:underline ${bad ? "font-medium text-warning" : ""}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${bad ? "bg-warning" : "bg-muted-foreground/40"}`} />{text}
    </Link>
  );
  return (
    <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {part(agentBad, !agent ? "Hermes nunca conectado" : agentBad ? `Hermes sem sinal ${relTime(agent.last_seen_at)}` : `Hermes online ${relTime(agent.last_seen_at)}`, "/configuracoes/hermes")}
      <span aria-hidden>·</span>
      {part(csvBad, csvText, "/configuracoes/hermes")}
    </div>
  );
}

/* ── barras horizontais clicáveis ── */
function BarsPanel({ title, rows }: { title: string; rows: { label: string; value: number; to?: string }[]; unit?: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <Card className="flex h-full flex-col rounded-xl">
      <CardTitleRow icon={Users} title={title} action={<span aria-label={`${title}: total`} className="text-sm tabular-nums text-muted-foreground">{total.toLocaleString("pt-BR")}</span>} />
      <CardContent className="flex flex-1 flex-col justify-between gap-4 px-5 pb-5 pt-0">
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          const inner = (
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block truncate text-sm" title={r.label}>{r.label}</span>
                <div className="h-3.5 w-full overflow-hidden rounded-md bg-muted"><div className="h-full rounded-md bg-primary transition-all duration-500" style={{ width: `${r.value > 0 ? Math.max(4, pct) : 0}%` }} /></div>
              </div>
              <span className="w-14 text-right text-sm font-semibold tabular-nums">{r.value.toLocaleString("pt-BR")}</span>
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">{pct}%</span>
            </div>
          );
          return r.to ? <Link key={r.label} to={r.to} className="block rounded-md hover:opacity-90">{inner}</Link> : <div key={r.label}>{inner}</div>;
        })}
      </CardContent>
    </Card>
  );
}

/* ── pendências de governança ── */
function GovernanceList({ m, loading }: { m: Row; loading: boolean }) {
  const items: { icon: typeof Users; label: string; value: number; to: string; tone: "warning" | "destructive" | "info" | "muted" }[] = [
    { icon: FileCheck, label: "Exceções pendentes", value: m?.excecoes_pendentes ?? 0, to: "/excecoes?aba=pendentes", tone: "warning" },
    { icon: CalendarClock, label: "Exceções vencendo", value: m?.excecoes_vencendo ?? 0, to: "/excecoes?aba=aprovadas&pendencia=vencendo", tone: "info" },
    { icon: ClipboardCheck, label: "Revisões abertas", value: m?.revisoes_abertas ?? 0, to: "/revisoes?status=em_andamento", tone: "info" },
    { icon: Hourglass, label: "Revisões atrasadas", value: m?.revisoes_atrasadas ?? 0, to: "/revisoes?status=atrasadas", tone: "destructive" },
    { icon: UserCheck, label: "Contratos vencidos", value: m?.terc_vencidos ?? 0, to: "/terceiros?pendencia=vencidos", tone: "destructive" },
    { icon: CalendarClock, label: "Contratos vencendo", value: m?.terc_vencendo_30d ?? 0, to: "/terceiros?pendencia=vencendo", tone: "warning" },
    { icon: UserCheck, label: "Terceiros a revalidar", value: m?.terc_revalidar ?? 0, to: "/terceiros?pendencia=revalidar", tone: "warning" },
    { icon: ShieldAlert, label: "Conflitos de acesso (SoD)", value: m?.sod_violacoes ?? 0, to: "/sod?aba=violacoes", tone: "destructive" },
    { icon: KeyRound, label: "Licenças críticas", value: m?.licencas_criticas ?? 0, to: "/licencas?pendencia=criticas", tone: "warning" },
    { icon: Users, label: "Contas órfãs no Entra", value: m?.fila_orfaos ?? 0, to: "/fila-provisionamento?tab=aprovacao&action=review_orphan_entra", tone: "warning" },
    { icon: FileSpreadsheet, label: "RH: precisa de você", value: m?.quarentena ?? 0, to: "/colaboradores/quarentena", tone: "warning" },
    { icon: Users, label: "Ativos sem conta Entra", value: m?.colab_sem_entra ?? 0, to: "/colaboradores?status=ativo&pendencia=sem_entra", tone: "info" },
    { icon: Users, label: "Ativos sem cargo", value: m?.colab_sem_cargo ?? 0, to: "/colaboradores?status=ativo&pendencia=sem_cargo", tone: "muted" },
    { icon: Crown, label: "Acessos privilegiados", value: m?.priv_membros ?? 0, to: "/privilegiados?privilegiadas=1", tone: "muted" },
  ];
  const open = items.filter((i) => i.value > 0);
  return (
    <Card className="flex h-full flex-col rounded-xl">
      <CardTitleRow icon={Shield} title="Pendências de governança" />
      <CardContent className="flex-1 overflow-auto px-5 pb-4 pt-0">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : open.length === 0 ? (
          <div className="py-10"><EmptyState message="Nenhuma pendência — tudo em dia." /></div>
        ) : (
          <ul className="divide-y divide-border/60">
            {open.map((i) => (
              <li key={i.label}>
                <Link to={i.to} className="group flex items-center gap-3 py-3 text-sm text-foreground/85 transition-colors hover:text-foreground">
                  <span className="flex-1 truncate" title={i.label}>{i.label}</span>
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-md border border-warning/70 bg-warning/15 px-1.5 text-xs font-semibold tabular-nums text-warning">{i.value}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CardTitleRow({ icon: Icon, title, action }: { icon: typeof Users; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-5">
      <h3 className="flex items-center gap-2.5 text-lg font-medium"><Icon className="h-5 w-5 text-primary" />{title}</h3>
      {action}
    </div>
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
  const people = usePeopleSeries(period * 2);
  const ppl = useMemo(() => splitPeriods(people.data ?? [], period), [people.data, period]);
  const pplChart = useMemo(() => ppl.cur.map((p) => ({ ...p, label: fmtDay(p.dia) })), [ppl]);
  const tick = period === 7 ? 0 : period === 30 ? 4 : 14;

  const { data: k } = useDashboardKpis(period);
  const { data: contasServico = 0 } = useQuery({
    queryKey: ["dashboard_contas_servico"],
    queryFn: async () => {
      const { count, error } = await supabase.from("contas_servico").select("id", { count: "exact", head: true }).eq("ativo", true);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 30000,
  });
  // as contas de serviço ficam ancoradas em terceiros; aqui aparecem só na categoria própria
  const tercAtivos = Math.max(0, (m?.terc_ativos ?? 0) - contasServico);
  const pessoas = (m?.colab_ativos ?? 0) + (m?.colab_ferias ?? 0) + (m?.colab_afastados ?? 0) + (m?.terc_ativos ?? 0);
  const waitingAge = ageLabel(m?.fila_oldest_waiting);
  const pendingAge = ageLabel(m?.fila_oldest_pending);

  const kpis = [
    { label: "Aguardando aprovação", value: m?.fila_waiting ?? 0, hint: waitingAge ? `mais antigo: ${waitingAge}` : "nada pendente", icon: ShieldCheck, tone: (m?.fila_waiting ?? 0) > 0 ? "warning" as const : "success" as const, to: "/fila-provisionamento?tab=aprovacao" },
    { label: "Falhas do agente", value: m?.fila_failed ?? 0, hint: `${m?.fila_success_24h ?? 0} concluídos em 24 h${pendingAge ? ` · espera: ${pendingAge}` : ""}`, icon: XCircle, tone: (m?.fila_failed ?? 0) > 0 ? "destructive" as const : "success" as const, to: "/fila-provisionamento?status=failed" },
    { label: "Revisões abertas", value: m?.revisoes_abertas ?? 0, hint: `${pessoas} pessoas ativas`, icon: Users, tone: "primary" as const, to: "/revisoes?status=em_andamento" },
    { label: "Terceiros vencidos", value: m?.terc_vencidos ?? 0, hint: `${m?.excecoes_pendentes ?? 0} exceções pendentes`, icon: FileCheck, tone: (m?.terc_vencidos ?? 0) > 0 ? "destructive" as const : "success" as const, to: "/terceiros?pendencia=vencidos" },
  ];

  const strip = [
    { label: "Pessoas ativas", value: k?.pessoas_ativas ?? pessoas, icon: Users, tone: "primary", to: "/colaboradores?status=ativo", hint: `${k?.admissoes ?? 0} admissões · ${k?.desligamentos ?? 0} saídas em ${period} d` },
    { label: `Execuções em ${period} d`, value: ppl.total, prev: ppl.prevTotal, icon: Play, tone: "primary", to: "/auditoria", hint: `${ppl.entradas} entradas · ${ppl.saidas} saídas` },
    { label: "Aguardando aprovação", value: k?.aguardando ?? m?.fila_waiting ?? 0, icon: Clock, tone: "warning", to: "/fila-provisionamento?tab=aprovacao", hint: waitingAge ? `mais antigo: ${waitingAge}` : "nada pendente" },
    { label: "Falhas em 24 h", value: k?.falhas_24h ?? 0, prev: k?.falhas_prev, invert: true, icon: AlertCircle, tone: "destructive", to: "/fila-provisionamento?status=failed", hint: "vs 24 h anteriores" },
  ] as const;
  const toneCls: Record<string, string> = { primary: "bg-primary/15 text-primary", warning: "bg-warning/15 text-warning", destructive: "bg-destructive/15 text-destructive" };

  return (
    <div className="mx-auto max-w-[1700px] space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Governança de Identidades</h1>
        <p className="text-sm text-muted-foreground">Visibilidade. Controle. Conformidade.{m?.gerado_em ? <span className="text-xs"> · atualizado {relTime(m.gerado_em)}</span> : null} · <AutoUpdatedHint tasks={["sync-entra-licencas", "sync-entra-groups"]} /></p>
      </div>

      <QueryState loading={isLoading} error={metricsError || (!isLoading && !m ? new Error("Métricas indisponíveis") : null)} retry={retryMetrics}>
      <div className="pt-1"><SystemStrip m={m} loading={isLoading} /></div>

      {/* Faixa de indicadores */}
      <Card className="rounded-xl">
        <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {strip.map((s) => {
            const prev = "prev" in s ? s.prev : undefined;
            const delta = prev === undefined || prev === null ? null : prev === 0 ? (s.value > 0 ? 100 : 0) : Math.round(((s.value - prev) / prev) * 100);
            const good = delta === null ? true : ("invert" in s && s.invert) ? delta <= 0 : delta >= 0;
            return (
              <Link key={s.label} to={s.to} className="flex items-center gap-4 p-5 transition-colors hover:bg-muted/40">
                <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${toneCls[s.tone]}`}><s.icon className="h-6 w-6" /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-semibold tabular-nums leading-tight">{Number(s.value).toLocaleString("pt-BR")}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {delta !== null && <span className={`flex items-center gap-0.5 font-medium ${good ? "text-success" : "text-destructive"}`}>{delta >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{delta > 0 ? "+" : ""}{delta}%</span>}
                    <span className="truncate">{s.hint}</span>
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
      </QueryState>

      {/* Gráfico principal */}
      <QueryState loading={people.isLoading} error={people.error} retry={people.refetch}>
      <Card className="rounded-xl">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Entradas e saídas por dia</CardTitle>
              <p className="text-xs text-muted-foreground">Cada pessoa conta uma vez por dia</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-3 text-xs">
                {[{ k: "entradas", l: "Entradas", c: CH.in }, { k: "saidas", l: "Saídas", c: CH.out }].map((x) => (
                  <button key={x.k} type="button" onClick={() => toggle(x.k)} className={`flex items-center gap-1.5 ${hidden.has(x.k) ? "opacity-40" : ""}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: x.c }} />{x.l}</button>
                ))}
              </div>
              <div className="flex rounded-md border p-0.5">{([7, 30, 90] as Period[]).map((d) => <Button key={d} size="sm" variant={period === d ? "secondary" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setPeriod(d)}>{d} dias</Button>)}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[280px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pplChart} margin={{ left: -16, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CH.in} stopOpacity={0.35} /><stop offset="100%" stopColor={CH.in} stopOpacity={0} /></linearGradient>
                <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CH.out} stopOpacity={0.25} /><stop offset="100%" stopColor={CH.out} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" interval={tick} tick={{ fill: CH.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CH.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="entradas" name="Entradas" stroke={CH.in} strokeWidth={2} fill="url(#g-in)" hide={hidden.has("entradas")} />
              <Area type="monotone" dataKey="saidas" name="Saídas" stroke={CH.out} strokeWidth={2} fill="url(#g-out)" hide={hidden.has("saidas")} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </QueryState>

      {/* Base: 4 cartões */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <BarsPanel title="Categoria de Usuários" unit="usuários" rows={[
          { label: "Ativos", value: m?.colab_ativos ?? 0, color: C.primary, to: "/colaboradores?status=ativo" },
          { label: "Férias", value: m?.colab_ferias ?? 0, color: C.info, to: "/colaboradores?status=ferias" },
          { label: "Afastados", value: m?.colab_afastados ?? 0, color: C.warning, to: "/colaboradores?status=afastado" },
          { label: "Terceiros ativos", value: tercAtivos, color: C.violet, to: "/terceiros" },
          { label: "Contas de serviço", value: contasServico, color: C.muted, to: "/contas-servico" },
        ]} />
        <LicensesPanel rows={k?.licencas ?? []} />
        <GovernanceList m={m} loading={isLoading || !!metricsError} />
        <Card className="h-full rounded-xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">Atividade recente</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ActivityFeed limit={6} />
            <Link to="/auditoria" className="block px-4 py-3 text-xs font-medium text-primary hover:underline">Ver toda a atividade →</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const CH = { in: "hsl(var(--primary))", out: "hsl(var(--destructive))", axis: "hsl(var(--muted-foreground))" };

