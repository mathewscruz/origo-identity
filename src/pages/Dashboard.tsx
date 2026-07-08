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
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Link } from "react-router-dom";
import EmptyState from "@/components/EmptyState";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ── palette ── */
const COLORS = [
  "hsl(176, 74%, 34%)",  // primary teal
  "hsl(199, 89%, 48%)",  // info blue
  "hsl(142, 71%, 45%)",  // success green
  "hsl(38, 92%, 50%)",   // warning amber
  "hsl(0, 84%, 60%)",    // destructive red
  "hsl(262, 52%, 47%)",  // purple
];

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

function getPeriodConfig(period: Period) {
  const now = new Date();
  switch (period) {
    case "dia": return { daysBack: 14, buckets: 14, labelFn: (i: number) => {
      const d = new Date(now); d.setDate(d.getDate() - (13 - i));
      return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
    }, bucketFn: (age: number) => Math.min(13, Math.floor(age / 86400000)), reverse: 14 };
    case "semana": {
      const getWeekNumber = (d: Date) => {
        const start = new Date(d.getFullYear(), 0, 1);
        const diff = d.getTime() - start.getTime() + ((start.getDay() + 6) % 7) * 86400000;
        return Math.ceil(diff / (7 * 86400000));
      };
      return { daysBack: 56, buckets: 8, labelFn: (i: number) => {
        const d = new Date(now); d.setDate(d.getDate() - (7 - i) * 7);
        return `Sem ${getWeekNumber(d)}`;
      }, bucketFn: (age: number) => Math.min(7, Math.floor(age / (7 * 86400000))), reverse: 8 };
    }
    case "mes": return { daysBack: 365, buckets: 12, labelFn: (i: number) => {
      const d = new Date(now); d.setMonth(d.getMonth() - (11 - i));
      const m = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      return `${m}/${d.getFullYear().toString().slice(2)}`;
    }, bucketFn: (age: number) => Math.min(11, Math.floor(age / (30 * 86400000))), reverse: 12 };
    case "ano": return { daysBack: 1460, buckets: 4, labelFn: (i: number) => `${now.getFullYear() - 3 + i}`, bucketFn: (age: number) => Math.min(3, Math.floor(age / (365 * 86400000))), reverse: 4 };
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
  const cfg = getPeriodConfig(period);
  return useQuery({
    queryKey: ["dashboard_prov", period],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - cfg.daysBack);
      const { data } = await supabase
        .from("iam_queue")
        .select("action_type, created_at")
        .gte("created_at", since.toISOString())
        .not("status", "eq", "cancelled");
      const rows = data ?? [];
      const buckets: Record<string, { assign: number; remove: number; other: number }> = {};
      for (let i = 0; i < cfg.buckets; i++) buckets[cfg.labelFn(i)] = { assign: 0, remove: 0, other: 0 };
      const now = Date.now();
      rows.forEach(r => {
        const age = now - new Date(r.created_at).getTime();
        const idx = cfg.bucketFn(age);
        const key = cfg.labelFn(cfg.reverse - 1 - idx);
        if (!buckets[key]) return;
        const at = r.action_type || "";
        if (at.startsWith("assign")) buckets[key].assign++;
        else if (at.startsWith("remove") || at.startsWith("disable")) buckets[key].remove++;
        else buckets[key].other++;
      });
      return Object.entries(buckets).map(([semana, v]) => ({
        semana, Concessão: v.assign, Revogação: v.remove, Outros: v.other,
      }));
    },
  });
}

function useAccessByApp() {
  return useQuery({
    queryKey: ["dashboard_access_by_app"],
    queryFn: async () => {
      const { data: atribuicoes } = await supabase
        .from("perfil_atribuicoes")
        .select("perfil_id")
        .eq("ativo", true)
        .is("data_revogacao", null);
      if (!atribuicoes?.length) return [];
      const perfilIds = [...new Set(atribuicoes.map(a => a.perfil_id))];
      // Fetch em lotes de 500 para evitar limites de URL
      const perfilApps: { aplicacao_id: string; perfil_id: string }[] = [];
      for (let i = 0; i < perfilIds.length; i += 500) {
        const batch = perfilIds.slice(i, i + 500);
        const { data } = await supabase
          .from("perfil_aplicacoes")
          .select("aplicacao_id, perfil_id")
          .in("perfil_id", batch);
        if (data) perfilApps.push(...data);
      }
      if (!perfilApps.length) return [];
      const appCount: Record<string, number> = {};
      const perfilCountMap: Record<string, number> = {};
      atribuicoes.forEach(a => { perfilCountMap[a.perfil_id] = (perfilCountMap[a.perfil_id] || 0) + 1; });
      perfilApps.forEach(pa => {
        appCount[pa.aplicacao_id] = (appCount[pa.aplicacao_id] || 0) + (perfilCountMap[pa.perfil_id] || 1);
      });
      const appIds = Object.keys(appCount);
      const appNames: Record<string, string> = {};
      for (let i = 0; i < appIds.length; i += 500) {
        const batch = appIds.slice(i, i + 500);
        const { data: apps } = await supabase.from("aplicacoes").select("id, nome").in("id", batch);
        (apps ?? []).forEach(a => { appNames[a.id] = a.nome; });
      }
      const sorted = Object.entries(appCount)
        .map(([id, value]) => ({ name: appNames[id] || "Desconhecido", value }))
        .sort((a, b) => b.value - a.value);
      if (sorted.length <= 5) return sorted;
      const top5 = sorted.slice(0, 5);
      const others = sorted.slice(5).reduce((sum, i) => sum + i.value, 0);
      return [...top5, { name: "Outros", value: others }];
    },
  });
}

function useSolicitacoesByStatus(period: Period) {
  const cfg = getPeriodConfig(period);
  return useQuery({
    queryKey: ["dashboard_solicit_status", period],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - cfg.daysBack);
      const { data } = await supabase
        .from("solicitacoes_acesso")
        .select("status")
        .gte("created_at", since.toISOString());
      const counts: Record<string, number> = {};
      (data ?? []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
      return Object.entries(counts)
        .map(([status, value]) => ({
          name: STATUS_MAP[status]?.label || status,
          value,
          color: STATUS_MAP[status]?.color || "hsl(215, 16%, 47%)",
        }))
        .filter(d => d.value > 0);
    },
    staleTime: 15000,
  });
}

function useRevisoesAtivas() {
  return useQuery({
    queryKey: ["dashboard_revisoes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("revisoes")
        .select("id, nome, total_itens, itens_revisados, status")
        .eq("status", "em_andamento")
        .order("created_at", { ascending: false })
        .limit(4);
      return data ?? [];
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
): string {
  const p = q.payload_json || {};
  const name = resolvedName || p.displayName || q.target_identity || "";
  const at = q.action_type || "";
  if (at.includes("group") && p.groupName) return `${name} → ${p.groupName}`;
  if (at.includes("app") && p.appName) return `${name} → ${p.appName}`;
  if (at.includes("license") && p.licenseName) return `${name} → ${p.licenseName}`;
  return name || ACTION_LABELS[at] || at;
}

function useRecentActivity() {
  return useQuery({
    queryKey: ["dashboard_activity"],
    queryFn: async () => {
      const [queueRes, solicitRes] = await Promise.all([
        (supabase as any).from("iam_queue")
          .select("id, action_type, target_identity, status, created_at, payload_json, colaborador_id")
          .not("status", "eq", "cancelled")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("solicitacoes_acesso")
          .select("id, status, created_at, justificativa")
          .order("created_at", { ascending: false })
          .limit(5),
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
        label: buildQueueLabel(q, q.colaborador_id ? colaboradorNames.get(q.colaborador_id) : undefined),
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
  const { data: accessByApp } = useAccessByApp();
  const { data: solicitStatus } = useSolicitacoesByStatus(solicitPeriod);
  const { data: revisoes } = useRevisoesAtivas();
  const { data: activity } = useRecentActivity();

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

      {/* Row 2: Area chart + App donut */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7 animate-content-in stagger-3">
        <Card data-tour="chart-provisioning" className="lg:col-span-4">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Provisionamento</CardTitle>
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
              <AreaChart data={provData ?? []}>
                <defs>
                  <linearGradient id="gradConcessao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRevogacao" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradOutros" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="semana" className="text-xs" tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Concessão" stroke="hsl(142, 71%, 45%)" fill="url(#gradConcessao)" strokeWidth={2} />
                <Area type="monotone" dataKey="Revogação" stroke="hsl(0, 84%, 60%)" fill="url(#gradRevogacao)" strokeWidth={2} />
                <Area type="monotone" dataKey="Outros" stroke="hsl(199, 89%, 48%)" fill="url(#gradOutros)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Acessos por Aplicação</CardTitle>
          </CardHeader>
          <CardContent>
            {(accessByApp ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={accessByApp} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name">
                    {(accessByApp ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [`${v} atribuições`, name]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(214, 32%, 91%)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center"><EmptyState message="Nenhuma atribuição encontrada" /></div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Solicitações donut + Revisões */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 animate-content-in stagger-4">
        <Card data-tour="chart-requests">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Solicitações</CardTitle>
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
            {(solicitStatus ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={solicitStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name">
                    {(solicitStatus ?? []).map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, name: string) => [`${v}`, name]} contentStyle={{ borderRadius: 8, border: "1px solid hsl(214, 32%, 91%)", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center"><EmptyState message="Nenhuma solicitação no período" /></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Revisões de Acesso em Andamento</CardTitle>
              <Link to="/revisoes" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todas <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {(revisoes ?? []).length > 0 ? (
              <div className="space-y-4">
                {(revisoes ?? []).map((rev) => {
                  const pct = rev.total_itens > 0 ? Math.round((rev.itens_revisados / rev.total_itens) * 100) : 0;
                  return (
                    <Link key={rev.id} to={`/revisoes/${rev.id}`} className="block group">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium truncate max-w-[70%] group-hover:text-primary transition-colors">{rev.nome}</span>
                        <span className="text-xs text-muted-foreground">{rev.itens_revisados}/{rev.total_itens} itens</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={pct} className="flex-1 h-2" />
                        <span className="text-xs font-semibold text-muted-foreground w-10 text-right">{pct}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center"><EmptyState message="Nenhuma revisão em andamento" /></div>
            )}
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
