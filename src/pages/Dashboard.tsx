import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Users, AlertTriangle, ShieldCheck, RefreshCw, AppWindow, FileCheck,
  ArrowUpRight, Clock, CheckCircle2, XCircle, Loader2, UserCheck, UserX,
  Plane, HeartPulse, UserMinus, ListChecks,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Link } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchResourceCatalogs, resolveResourceLabel, type ResourceCatalogs } from "@/lib/resourceNames";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:     { label: "Pendente",     color: "hsl(38, 92%, 50%)" },
  pending:      { label: "Pendente",     color: "hsl(38, 92%, 50%)" },
  em_aprovacao: { label: "Em Aprovação", color: "hsl(199, 89%, 48%)" },
  processing:   { label: "Processando", color: "hsl(199, 89%, 48%)" },
  aprovada:     { label: "Aprovada",     color: "hsl(142, 71%, 45%)" },
  success:      { label: "Concluído",   color: "hsl(142, 71%, 45%)" },
  rejeitada:    { label: "Rejeitada",    color: "hsl(0, 84%, 60%)" },
  failed:       { label: "Falhou",       color: "hsl(0, 84%, 60%)" },
};

type Period = "dia" | "semana" | "mes" | "ano";
const PERIOD_LABELS: Record<Period, string> = { dia: "Dia", semana: "Semana", mes: "Mês", ano: "Ano" };

const SP_TZ = "America/Sao_Paulo";

/** Componentes de data (ano/mês/dia) no fuso de São Paulo. */
function spParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [y, m, day] = fmt.format(d).split("-").map(Number);
  return { y, m, d: day };
}
/** Data "civil" (UTC-noon) equivalente ao dia em São Paulo — segura para aritmética. */
function spCivil(d: Date) {
  const { y, m, d: day } = spParts(d);
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
}
const dayKey = (c: Date) => c.toISOString().slice(0, 10);
const monthKey = (c: Date) => c.toISOString().slice(0, 7);
const yearKey = (c: Date) => String(c.getUTCFullYear());
/** Segunda-feira da semana da data civil. */
function weekStart(c: Date) {
  const w = new Date(c);
  w.setUTCDate(w.getUTCDate() - ((w.getUTCDay() + 6) % 7));
  return w;
}
function isoWeekNumber(c: Date) {
  const t = new Date(c);
  t.setUTCDate(t.getUTCDate() + 4 - ((t.getUTCDay() + 6) % 7 + 1));
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
}

type PeriodConfig = {
  daysBack: number;
  buckets: { key: string; label: string }[];
  keyFn: (d: Date) => string;
};

type ProvisioningPeriodConfig = {
  daysBack: number;
  buckets: { key: string; label: string }[];
  keyFn: (d: Date) => string;
};

function getProvisioningPeriodConfig(period: Period): ProvisioningPeriodConfig {
  const today = spCivil(new Date());
  const daysByPeriod: Record<Period, number> = {
    dia: 14,
    semana: 30,
    mes: 90,
    ano: 365,
  };
  const daysBack = daysByPeriod[period];
  const buckets = Array.from({ length: daysBack }, (_, i) => {
    const c = new Date(today);
    c.setUTCDate(c.getUTCDate() - (daysBack - 1 - i));
    return {
      key: dayKey(c),
      label: `${String(c.getUTCDate()).padStart(2, "0")}/${String(c.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  });
  return { daysBack, buckets, keyFn: (d) => dayKey(spCivil(d)) };
}

function getPeriodConfig(period: Period): PeriodConfig {
  const today = spCivil(new Date());
  switch (period) {
    case "dia": {
      const buckets = Array.from({ length: 14 }, (_, i) => {
        const c = new Date(today);
        c.setUTCDate(c.getUTCDate() - (13 - i));
        return {
          key: dayKey(c),
          label: `${String(c.getUTCDate()).padStart(2, "0")}/${String(c.getUTCMonth() + 1).padStart(2, "0")}`,
        };
      });
      return { daysBack: 14, buckets, keyFn: (d) => dayKey(spCivil(d)) };
    }
    case "semana": {
      const thisWeek = weekStart(today);
      const buckets = Array.from({ length: 8 }, (_, i) => {
        const c = new Date(thisWeek);
        c.setUTCDate(c.getUTCDate() - (7 - i) * 7);
        return { key: dayKey(c), label: `Sem ${isoWeekNumber(c)}` };
      });
      return { daysBack: 60, buckets, keyFn: (d) => dayKey(weekStart(spCivil(d))) };
    }
    case "mes": {
      const buckets = Array.from({ length: 12 }, (_, i) => {
        const c = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (11 - i), 1, 12));
        const m = c.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
        return { key: monthKey(c), label: `${m}/${String(c.getUTCFullYear()).slice(2)}` };
      });
      return { daysBack: 366, buckets, keyFn: (d) => monthKey(spCivil(d)) };
    }
    case "ano": {
      const y0 = today.getUTCFullYear() - 3;
      const buckets = Array.from({ length: 4 }, (_, i) => ({ key: String(y0 + i), label: String(y0 + i) }));
      return { daysBack: 1461, buckets, keyFn: (d) => yearKey(spCivil(d)) };
    }
  }
}

/* ── hooks ── */

function useKpiCounts() {
  return useQuery({

    queryKey: ["dashboard_kpis"],
    queryFn: async () => {
      const [colabs, terceiros, apps, perfis, solicit, filaPending, filaWaiting, alertas] = await Promise.all([
        supabase.from("colaboradores").select("id", { count: "exact", head: true }).not("status", "in", "(inativo,desligado)"),
        supabase.from("terceiros").select("id", { count: "exact", head: true }).eq("ativo", true),
        supabase.from("aplicacoes").select("id", { count: "exact", head: true }),
        supabase.from("perfis_acesso").select("id", { count: "exact", head: true }).eq("ativo", true),
        supabase.from("solicitacoes_acesso").select("id", { count: "exact", head: true }).in("status", ["pendente", "em_aprovacao"]),
        supabase.from("iam_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("iam_queue").select("id", { count: "exact", head: true }).eq("status", "waiting_approval"),
        supabase.from("alertas").select("id", { count: "exact", head: true }).eq("lido", false),
      ]);
      return {
        pessoasAtivas: (colabs.count ?? 0) + (terceiros.count ?? 0),
        terceirosAtivos: terceiros.count ?? 0,
        appsConectadas: apps.count ?? 0,
        perfisAtivos: perfis.count ?? 0,
        solicitPendentes: solicit.count ?? 0,
        filaPendente: (filaPending.count ?? 0) + (filaWaiting.count ?? 0),
        filaAguardandoAprovacao: filaWaiting.count ?? 0,
        filaProntoExecucao: filaPending.count ?? 0,
        alertasNaoLidos: alertas.count ?? 0,
      };
    },
    staleTime: 15000,
  });
}

function useProvisioningData(period: Period) {
  const cfg = getProvisioningPeriodConfig(period);
  return useQuery({
    queryKey: ["dashboard_prov", period],
    queryFn: async () => {
      const since = spCivil(new Date());
      since.setUTCDate(since.getUTCDate() - cfg.daysBack);
      since.setUTCHours(0, 0, 0, 0);

      // Busca paginada (o padrão retorna no máximo 1000 linhas)
      const rows: { action_type: string | null; created_at: string }[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("iam_queue")
          .select("action_type, created_at")
          .gte("created_at", since.toISOString())
          .not("status", "eq", "cancelled")
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) break;
        rows.push(...((data ?? []) as any[]));
        if (!data || data.length < PAGE) break;
      }

      const byKey = new Map(cfg.buckets.map((b) => [b.key, { assign: 0, remove: 0, other: 0 }]));
      rows.forEach((r) => {
        const bucket = byKey.get(cfg.keyFn(new Date(r.created_at)));
        if (!bucket) return;
        const at = r.action_type || "";
        if (at.startsWith("assign")) bucket.assign++;
        else if (at.startsWith("remove") || at.startsWith("disable")) bucket.remove++;
        else bucket.other++;
      });

      // Valores por período (não acumulados)
      return cfg.buckets.map((b) => {
        const v = byKey.get(b.key) ?? { assign: 0, remove: 0, other: 0 };
        return { dia: b.label, "Concessão": v.assign, "Revogação": v.remove, Outros: v.other };
      });
    },

    staleTime: 15000,
  });
}

const COLAB_STATUS_META: Record<string, { label: string; color: string }> = {
  ativo:     { label: "Ativo",     color: "hsl(142, 71%, 45%)" },
  ferias:    { label: "Férias",    color: "hsl(199, 89%, 48%)" },
  afastado:  { label: "Afastado",  color: "hsl(38, 92%, 50%)" },
  inativo:   { label: "Inativo",   color: "hsl(215, 16%, 47%)" },
  desligado: { label: "Desligado", color: "hsl(0, 84%, 60%)" },
};

function useColabsByStatus() {
  return useQuery({
    queryKey: ["dashboard_colabs_status"],
    queryFn: async () => {
      const statuses = Object.keys(COLAB_STATUS_META);
      const results = await Promise.all(
        statuses.map((s) =>
          supabase.from("colaboradores").select("id", { count: "exact", head: true }).eq("status", s as any),
        ),
      );
      return statuses
        .map((s, i) => ({
          name: COLAB_STATUS_META[s].label,
          value: results[i].count ?? 0,
          color: COLAB_STATUS_META[s].color,
        }));
    },
    staleTime: 30000,
  });
}

const JML_TIPO_META: Record<string, { label: string; color: string }> = {
  joiner: { label: "Joiner", color: "hsl(142, 71%, 45%)" },
  mover:  { label: "Mover",  color: "hsl(199, 89%, 48%)" },
  leaver: { label: "Leaver", color: "hsl(0, 84%, 60%)" },
};

function useEventosJmlByTipo(period: Period) {
  const cfg = getPeriodConfig(period);
  return useQuery({
    queryKey: ["dashboard_jml_tipo", period],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - cfg.daysBack);
      const rows: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data } = await supabase
          .from("eventos_jml")
          .select("tipo, colaborador_id, colaborador_nome")
          .gte("created_at", since.toISOString())
          .range(from, from + pageSize - 1);
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < pageSize) break;
      }
      const counts: Record<string, number> = {};
      // Leaver = saída efetiva do colaborador: conta apenas 1 evento por pessoa
      const leaverSeen = new Set<string>();
      rows.forEach((r: any) => {
        if (r.tipo === "leaver") {
          const key = r.colaborador_id ?? r.colaborador_nome ?? Math.random().toString();
          if (leaverSeen.has(key)) return;
          leaverSeen.add(key);
        }
        counts[r.tipo] = (counts[r.tipo] || 0) + 1;
      });
      return Object.entries(JML_TIPO_META)
        .map(([tipo, meta]) => ({
          name: meta.label,
          value: counts[tipo] ?? 0,
          color: meta.color,
        }));
    },
    staleTime: 15000,
  });
}

const QUEUE_STATUS_META: Record<string, { label: string; color: string; href: string }> = {
  waiting_approval: { label: "Aguardando aprovação", color: "hsl(199, 89%, 48%)", href: "/fila-provisionamento?status=waiting_approval" },
  pending:          { label: "Pendente execução",    color: "hsl(38, 92%, 50%)",  href: "/fila-provisionamento?status=pending" },
  processing:       { label: "Processando",          color: "hsl(262, 52%, 47%)", href: "/fila-provisionamento?status=processing" },
  failed:           { label: "Falhou",               color: "hsl(0, 84%, 60%)",   href: "/fila-provisionamento?status=failed" },
  success:          { label: "Concluído (7d)",       color: "hsl(142, 71%, 45%)", href: "/fila-provisionamento?status=success" },
};

function useQueueByStatus() {
  return useQuery({
    queryKey: ["dashboard_queue_status"],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const statuses = Object.keys(QUEUE_STATUS_META);
      const results = await Promise.all(
        statuses.map((s) => {
          let q = supabase.from("iam_queue").select("id", { count: "exact", head: true }).eq("status", s);
          if (s === "success") q = q.gte("created_at", sevenDaysAgo.toISOString());
          return q;
        }),
      );
      return statuses.map((s, i) => ({
        status: s,
        label: QUEUE_STATUS_META[s].label,
        value: results[i].count ?? 0,
        color: QUEUE_STATUS_META[s].color,
        href: QUEUE_STATUS_META[s].href,
      }));
    },
    staleTime: 15000,
  });
}

const ACTION_LABELS: Record<string, string> = {
  assign_group: "Atribuição de Grupo",
  remove_group: "Remoção de Grupo",
  assign_app: "Atribuição de App",
  remove_app: "Remoção de App",
  assign_license: "Atribuição de Licença",
  remove_license: "Remoção de Licença",
  create: "Criação de Conta",
  create_if_not_exists: "Criação de Conta",
  update: "Atualização",
  disable: "Desativação",
  delete: "Exclusão",
};

function buildQueueLabel(
  q: { action_type: string; target_identity: string | null; payload_json: any },
  resolvedName?: string,
  catalogs?: ResourceCatalogs,
): string {
  const p = q.payload_json || {};
  const name = resolvedName || p.displayName || q.target_identity || "";
  const at = q.action_type || "";
  if (at.includes("group") || at.includes("app") || at.includes("license") || at.includes("sharepoint")) {
    const resource = resolveResourceLabel(q, catalogs, "");
    if (resource) return `${name} → ${resource}`;
  }
  return name || ACTION_LABELS[at] || at;
}

function useRecentActivity() {
  return useQuery({
    queryKey: ["dashboard_activity"],
    queryFn: async () => {
      const [queueRes, solicitRes, catalogs] = await Promise.all([
        (supabase as any).from("iam_queue")
          .select("id, action_type, target_identity, status, created_at, payload_json, colaborador_id")
          .not("status", "eq", "cancelled")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("solicitacoes_acesso")
          .select("id, status, created_at, justificativa")
          .order("created_at", { ascending: false })
          .limit(5),
        fetchResourceCatalogs(),
      ]);

      const colaboradorIds: string[] = Array.from(
        new Set<string>(
          (queueRes.data ?? [])
            .map((q: any) => q.colaborador_id as string | null)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      );
      const colaboradorNames = new Map<string, string>();

      if (colaboradorIds.length > 0) {
        const { data: colaboradores } = await supabase
          .from("colaboradores")
          .select("id, nome")
          .in("id", colaboradorIds);

        (colaboradores ?? []).forEach((colaborador) => {
          colaboradorNames.set(colaborador.id, colaborador.nome);
        });
      }

      type ActivityItem = {
        id: string; type: "queue" | "solicitacao"; label: string;
        sublabel: string; status: string; date: string; link: string;
      };
      const items: ActivityItem[] = [];
      (queueRes.data ?? []).forEach((q: any) => items.push({
        id: q.id, type: "queue",
        label: buildQueueLabel(q, q.colaborador_id ? colaboradorNames.get(q.colaborador_id) : undefined, catalogs),
        sublabel: ACTION_LABELS[q.action_type] || q.action_type,
        status: q.status, date: q.created_at,
        link: `/fila-provisionamento/${q.id}`,
      }));
      (solicitRes.data ?? []).forEach((s: any) => items.push({
        id: s.id, type: "solicitacao",
        label: (s.justificativa || "Solicitação").slice(0, 60),
        sublabel: "Solicitação de Acesso",
        status: s.status, date: s.created_at,
        link: "/solicitacoes",
      }));
      return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
    },
    staleTime: 15000,
  });
}

/* ── custom tooltip ── */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-xs">
      <p className="font-medium text-card-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.dataKey}:</span>
          <span className="font-semibold text-card-foreground">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

type CategoryDatum = { name: string; value: number; color: string };

function CategoryBars({ rows, unit }: { rows: CategoryDatum[]; unit: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="flex h-full min-h-[240px] flex-col justify-center gap-4">
      <div className="flex items-baseline justify-between border-b pb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</span>
        <span className="text-2xl font-semibold tracking-tight">{total}</span>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
          const width = row.value > 0 ? Math.max(3, Math.round((row.value / max) * 100)) : 0;
          return (
            <div key={row.name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="truncate font-medium">{row.name}</span>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{row.value}</span> {unit} · {pct}%
                </div>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${width}%`, backgroundColor: row.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── status icon ── */
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "pending": case "pendente": case "em_aprovacao":
      return <Clock className="h-4 w-4 text-warning" />;
    case "success": case "completed": case "aprovada":
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "failed": case "permanent_failure": case "rejeitada":
      return <XCircle className="h-4 w-4 text-destructive" />;
    case "processing":
      return <Loader2 className="h-4 w-4 text-info animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

/* ── main ── */
export default function Dashboard() {
  const [provPeriod, setProvPeriod] = useState<Period>("semana");
  const [solicitPeriod, setSolicitPeriod] = useState<Period>("semana");

  const { data: kpis } = useKpiCounts();
  const { data: provData } = useProvisioningData(provPeriod);
  const { data: colabsStatus } = useColabsByStatus();
  const { data: jmlTipo } = useEventosJmlByTipo(solicitPeriod);
  const { data: queueStatus } = useQueueByStatus();
  const { data: activity } = useRecentActivity();
  const provXAxisInterval = provPeriod === "dia" ? 0 : provPeriod === "semana" ? 4 : provPeriod === "mes" ? 9 : 30;

  const kpiCards = [
    { title: "Pessoas Ativas", value: kpis?.pessoasAtivas ?? 0, sub: `${kpis?.terceirosAtivos ?? 0} terceiros`, icon: Users, href: "/colaboradores", color: "text-primary" },
    { title: "Aplicações", value: kpis?.appsConectadas ?? 0, sub: "aplicações cadastradas", icon: AppWindow, href: "/aplicacoes", color: "text-info" },
    { title: "Perfis Ativos", value: kpis?.perfisAtivos ?? 0, sub: "perfis de acesso", icon: ShieldCheck, href: "/perfis-acesso", color: "text-success" },
    { title: "Solicitações Pendentes", value: kpis?.solicitPendentes ?? 0, sub: "aguardando decisão", icon: FileCheck, href: "/solicitacoes", color: "text-warning" },
    { title: "Fila de Provisionamento", value: kpis?.filaPendente ?? 0, sub: `${kpis?.filaAguardandoAprovacao ?? 0} aguardando aprovação · ${kpis?.filaProntoExecucao ?? 0} p/ execução`, icon: RefreshCw, href: "/fila-provisionamento", color: "text-info" },
    { title: "Alertas Não Lidos", value: kpis?.alertasNaoLidos ?? 0, sub: "requerem atenção", icon: AlertTriangle, href: "/alertas", color: (kpis?.alertasNaoLidos ?? 0) > 0 ? "text-destructive" : "text-success" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão operacional consolidada em tempo real</p>
      </div>

      {/* KPIs */}
      <div data-tour="kpi-cards" className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {kpiCards.map((k, i) => (
          <Link key={k.title} to={k.href} className={`group animate-content-in stagger-${i + 1}`}>
            <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/30 group-hover:-translate-y-0.5">
              <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">{k.title}</CardTitle>
                <k.icon className={`h-4 w-4 ${k.color} opacity-70`} />
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="text-2xl font-bold tracking-tight">{k.value}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{k.sub}</span>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Row 2: Provisioning + collaborator status */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7 animate-content-in stagger-3">
        <Card data-tour="chart-provisioning" className="lg:col-span-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Provisionamento diário</CardTitle>
                <p className="text-xs text-muted-foreground">Processamentos por dia, sem acumulado</p>
              </div>
              <div className="flex gap-1">
                {(["dia", "semana", "mes", "ano"] as Period[]).map(p => (
                  <Button key={p} size="sm" variant={provPeriod === p ? "default" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setProvPeriod(p)}>
                    {PERIOD_LABELS[p]}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={provData ?? []} barCategoryGap={provPeriod === "dia" ? "24%" : "12%"}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="dia" interval={provXAxisInterval} className="text-xs" tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Concessão" stackId="processamentos" fill="hsl(142, 71%, 45%)" radius={[0, 0, 3, 3]} />
                <Bar dataKey="Revogação" stackId="processamentos" fill="hsl(0, 84%, 60%)" />
                <Bar dataKey="Outros" stackId="processamentos" fill="hsl(199, 89%, 48%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Colaboradores por Status</CardTitle>
              <Link to="/colaboradores" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todos <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={colabsStatus ?? []} unit="colab." />
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Eventos JML + Fila por status */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 animate-content-in stagger-4">
        <Card data-tour="chart-requests">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Eventos JML por Tipo</CardTitle>
              <div className="flex gap-1">
                {(["dia", "semana", "mes", "ano"] as Period[]).map(p => (
                  <Button key={p} size="sm" variant={solicitPeriod === p ? "default" : "ghost"} className="h-7 px-2.5 text-xs" onClick={() => setSolicitPeriod(p)}>
                    {PERIOD_LABELS[p]}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={jmlTipo ?? []} unit="eventos" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Fila de Provisionamento por Status</CardTitle>
              <Link to="/fila-provisionamento" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver fila <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const rows = queueStatus ?? [];
              const max = Math.max(1, ...rows.map((r) => r.value));
              const hasAny = rows.some((r) => r.value > 0);
              if (!hasAny) {
                return <div className="flex h-[200px] items-center justify-center"><EmptyState message="Fila vazia" /></div>;
              }
              return (
                <div className="space-y-4">
                  {rows.map((r) => {
                    const pct = Math.round((r.value / max) * 100);
                    return (
                      <Link key={r.status} to={r.href} className="block group">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium group-hover:text-primary transition-colors">{r.label}</span>
                          <span className="text-xs font-semibold text-muted-foreground">{r.value}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: r.color }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>


      {/* Row 4: Activity timeline */}
      <Card data-tour="timeline" className="animate-content-in stagger-5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Atividade Recente</CardTitle>
        </CardHeader>
        <CardContent>
          {(activity ?? []).length > 0 ? (
            <div className="space-y-0">
              {(activity ?? []).map((item, idx) => (
                <Link
                  key={item.id + item.type}
                  to={item.link}
                  className="flex items-center gap-4 py-3 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
                  style={{ borderBottom: idx < (activity?.length ?? 0) - 1 ? "1px solid hsl(214, 32%, 91%)" : "none" }}
                >
                  <StatusIcon status={item.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {item.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.sublabel} · {new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase shrink-0">
                    {STATUS_MAP[item.status]?.label || item.status}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState message="Nenhuma atividade recente" size="lg" />
          )}
        </CardContent>
      </Card>
      <OnboardingTour pageKey="dashboard" steps={tourSteps.dashboard} />
    </div>
  );
}
