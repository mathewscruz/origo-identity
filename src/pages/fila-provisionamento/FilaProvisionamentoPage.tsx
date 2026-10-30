import { queueErrorLabel } from "@/lib/queueErrorLabels";
import { completedQueueLink, queueStatuses } from "@/lib/dashboardFilters";
import QueryState from "@/components/QueryState";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, X, Bot, CheckCircle2, Clock, ListOrdered, Loader2, RotateCcw, Search, ShieldCheck, XCircle, Ban, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AprovacaoTab from "./sections/AprovacaoTab";
import TablePagination from "@/components/TablePagination";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import DetailPanel from "@/components/DetailPanel";
import ConfirmImpactDialog from "@/components/ConfirmImpactDialog";
import StatCard from "@/components/StatCard";
import { useAgentStatus, useQueueDistinctActions, useQueuePage, useQueueStats } from "@/hooks/useOrigoData";
import { useCancelQueueItem, useReprocessQueueItem } from "@/hooks/mutations/useQueueActions";
import { useCanEdit } from "@/hooks/useRole";
import { useResourceNameResolver } from "@/lib/resourceNames";
import { actionBadgeClass, actionLabel, actionScope, QUEUE_STATUS_META, statusLabel } from "@/lib/queueLabels";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const STATUS_FILTERS: { value: string; label: string; statuses: string[] }[] = [
  { value: "agente", label: "Para o agente executar", statuses: queueStatuses("agente") },
  { value: "abertos", label: "Abertos", statuses: ["waiting_approval", "pending", "processing"] },
  { value: "waiting_approval", label: "Aguardando aprovação", statuses: ["waiting_approval"] },
  { value: "pending", label: "Pendente (agente)", statuses: ["pending"] },
  { value: "processing", label: "Executando", statuses: ["processing"] },
  { value: "failed", label: "Falhou", statuses: ["failed"] },
  { value: "success", label: "Concluído", statuses: ["success"] },
  { value: "cancelled", label: "Cancelado / recusado", statuses: ["cancelled", "rejected"] },
  { value: "todos", label: "Todos", statuses: [] },
];

type StepState = "success" | "failed" | "processing" | "pending" | "cancelled" | "none";
const STEP_NAMES = ["Criar conta", "Grupos", "Licenças", "Apps"] as const;
const STEP_DOT: Record<string, string> = { success: "bg-success", failed: "bg-destructive", processing: "bg-info", pending: "bg-warning", waiting_approval: "bg-info", cancelled: "bg-muted-foreground", rejected: "bg-muted-foreground" };
const RANK: Record<string, number> = { failed: 5, processing: 4, waiting_approval: 3, pending: 3, success: 1, cancelled: 0, rejected: 0 };

function stepOf(action: string): number {
  const a = action.toLowerCase();
  if (a.includes("group") || a.includes("grupo") || a.includes("sharepoint")) return 1;
  if (a.includes("licen")) return 2;
  if (a.endsWith("_user_app") || a.includes("app")) return 3;
  return 0;
}
function worst(statuses: string[]): string {
  return statuses.reduce((w, s) => ((RANK[s] ?? 2) > (RANK[w] ?? 2) ? s : w), statuses[0] ?? "pending");
}
function toStep(s?: string): StepState {
  if (!s) return "none";
  if (s === "success" || s === "failed" || s === "processing") return s;
  if (s === "cancelled" || s === "rejected") return "cancelled";
  return "pending";
}
function groupByPerson(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.colaborador_id || r.terceiro_id || r.target_identity || r.id;
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([key, items]) => {
    const f = items[0];
    const per: string[][] = [[], [], [], []];
    for (const i of items) per[stepOf(i.action_type)].push(i.status);
    const created = items.reduce((m, i) => (i.created_at < m ? i.created_at : m), f.created_at);
    return {
      key, items,
      who: f.payload_json?.displayName || f.target_identity || "—",
      email: f.payload_json?.userPrincipalName || f.payload_json?.mail || (f.target_identity && f.target_identity !== f.payload_json?.displayName ? f.target_identity : ""),
      status: worst(items.map((i) => i.status)),
      steps: per.map((st) => toStep(st.length ? worst(st) : undefined)),
      created,
      personLink: f.colaborador_id ? `/colaboradores/${f.colaborador_id}` : f.terceiro_id ? `/terceiros/${f.terceiro_id}` : null,
    };
  });
}

function Steps({ steps }: { steps: StepState[] }) {
  return (
    <div className="flex min-w-[300px] items-start">
      {steps.map((st, i) => (
        <div key={i} className="relative flex flex-1 flex-col items-center">
          {i > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${st === "success" || st === "failed" || st === "processing" ? "bg-primary" : "bg-border"}`} />}
          <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
            st === "success" ? "border-primary bg-primary text-primary-foreground" :
            st === "failed" ? "border-destructive bg-destructive text-destructive-foreground" :
            st === "processing" ? "border-primary bg-card text-primary" :
            st === "pending" ? "border-warning bg-card" :
            st === "cancelled" ? "border-muted-foreground/40 bg-muted" : "border-dashed border-border bg-card"}`}>
            {st === "success" && <Check className="h-3.5 w-3.5" />}
            {st === "failed" && <X className="h-3.5 w-3.5" />}
            {st === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
          </span>
          <span className={`mt-1 text-xs ${st === "none" ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{STEP_NAMES[i]}</span>
        </div>
      ))}
    </div>
  );
}

function relTime(iso?: string | null) {
  if (!iso) return "—";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

export default function FilaProvisionamentoPage() {
  const [params, setParams] = useSearchParams();
  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const resolveName = useResourceNameResolver();

  // aba "aprovacao" (decidir) ou "fila" (todos os itens); padrão: aprovação (filtros na URL abrem a lista)
  const tabParam = params.get("tab");
  const statusKey = params.get("status") || "abertos";
  const processedFrom = params.get("processed_from") || undefined;
  const actionFilter = params.get("action") || "todos";
  const originFilter = params.get("origem") || "todos";
  const [busca, setBusca] = useState(params.get("q") || "");
  const [buscaDebounced, setBuscaDebounced] = useState(busca);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [reprocessAllOpen, setReprocessAllOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);

  useEffect(() => { const t = setTimeout(() => setBuscaDebounced(busca.trim()), 300); return () => clearTimeout(t); }, [busca]);
  useEffect(() => { setPage(1); }, [statusKey, actionFilter, originFilter, buscaDebounced, processedFrom]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (key === "status") next.delete("processed_from");
    if (!value || (value === "todos" && key !== "status") || (key === "status" && value === "abertos")) next.delete(key); else next.set(key, value);
    next.set("tab", "fila");
    setParams(next, { replace: true });
  };

  const statuses = STATUS_FILTERS.find((f) => f.value === statusKey)?.statuses ?? [];
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: retryStats } = useQueueStats();
  const tab: "aprovacao" | "fila" = tabParam === "fila" || tabParam === "aprovacao" ? tabParam : (params.get("status") || params.get("action") || params.get("origem") ? "fila" : "aprovacao");
  const setTab = (t: "aprovacao" | "fila") => { const next = new URLSearchParams(params); next.set("tab", t); if (t === "aprovacao") { next.delete("status"); } setParams(next, { replace: true }); };
  const { data: agents } = useAgentStatus();
  const { data: pageData, isLoading, error: pageError, refetch: retryPage, isPlaceholderData } = useQueuePage({ page, pageSize, processedFrom, status: statuses, actionType: actionFilter !== "todos" ? actionFilter : undefined, requestedBy: originFilter !== "todos" ? originFilter : undefined, search: buscaDebounced || undefined });
  const { data: filters } = useQueueDistinctActions(statuses.length ? statuses : ["waiting_approval", "pending", "processing", "success", "failed", "cancelled", "rejected"]);
  const reprocess = useReprocessQueueItem();
  const cancel = useCancelQueueItem();

  const rows: Row[] = pageData?.rows ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const groups = useMemo(() => groupByPerson(rows), [rows]);
  const selected = groups.find((g) => g.key === selectedKey) ?? null;
  const total = pageData?.total ?? 0;

  const agent = agents?.[0];
  const agentAgeMin = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;
  const agentTone = !agent ? "destructive" : agentAgeMin < 5 ? "success" : agentAgeMin < 30 ? "warning" : "destructive";
  const agentText = !agent ? "nunca visto" : agentAgeMin < 5 ? "online" : agentAgeMin < 30 ? "sem sinal" : "offline";

  const reprocessAll = async () => {
    const { data, error } = await supabase.rpc("iam_queue_reprocessar_falhas", { p_action_types: null });
    if (error) { toast.error("Erro ao reprocessar", { description: error.message }); return; }
    toast.success(`${data ?? 0} item(ns) devolvido(s) à fila do agente`);
    setReprocessAllOpen(false);
    qc.invalidateQueries({ queryKey: ["iam_queue_page"] });
    qc.invalidateQueries({ queryKey: ["iam_queue_stats"] });
  };

  const kpis = useMemo(() => [
    { key: "waiting_approval", label: "Aguardando aprovação", value: stats?.waiting_approval ?? 0, icon: ShieldCheck, tone: "info" as const },
    { key: "pending", label: "Na fila", value: stats?.pending ?? 0, icon: Clock, tone: "warning" as const, hint: stats?.oldest_pending ? `mais antigo ${relTime(stats.oldest_pending)}${stats.retry_scheduled ? ` · ${stats.retry_scheduled} com retry agendado` : ""}` : undefined },
    { key: "processing", label: "Executando", value: stats?.processing ?? 0, icon: Loader2, tone: "primary" as const },
    { key: "failed", label: "Falhas", value: stats?.failed ?? 0, icon: XCircle, tone: "destructive" as const },
    { key: "success", label: "Concluídos (7 dias)", value: stats?.success_7d ?? 0, icon: CheckCircle2, tone: "success" as const, hint: `${stats?.cancelled_7d ?? 0} cancelado(s)/recusado(s)` },
  ], [stats]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fila de Provisionamento"
        icon={ListOrdered}
        description="Cada linha é uma ação em AD / Entra ID / SharePoint / apps. Aprove na primeira aba; só o Órigo Agente executa. Quem solicitou não pode aprovar."
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Badge variant="outline" className={`gap-1.5 py-1 ${agentTone === "success" ? "border-success/30 bg-success/10 text-success" : agentTone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
                    <Bot className="h-3.5 w-3.5" /> Agente {agentText}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>{agent ? `${agent.owner}${agent.version ? ` v${agent.version}` : ""} · ${agent.host || "?"} · visto ${relTime(agent.last_seen_at)} · ${agent.execute_mode === false ? "dry-run" : "executando"}` : "O agente ainda não chamou a API (iam-agent-api)."}</TooltipContent>
            </Tooltip>
            {canEdit && (stats?.failed ?? 0) > 0 && (
              <Button variant="outline" onClick={() => setReprocessAllOpen(true)}><RotateCcw className="mr-1 h-4 w-4" />Reprocessar {stats?.failed} falha(s)</Button>
            )}
          </>
        }
      />

      <QueryState loading={statsLoading} error={statsError} retry={retryStats}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {kpis.map((k) => {
          const active = k.key === "waiting_approval" ? tab === "aprovacao" : tab === "fila" && statusKey === k.key;
          return (
            <button key={k.key} type="button"
              onClick={() => k.key === "success" ? setParams(new URLSearchParams(completedQueueLink().split("?")[1])) : k.key === "waiting_approval" ? setTab("aprovacao") : setFilter("status", tab === "fila" && statusKey === k.key ? "abertos" : k.key)}
              className={`flex items-center justify-between rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/40 ${active ? "border-primary/60 bg-primary/5" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm">{k.label}</p>
                <p className={`mt-1 text-4xl font-semibold tabular-nums ${k.tone === "destructive" && k.value > 0 ? "text-destructive" : k.tone === "warning" ? "text-foreground" : "text-primary"}`}>{k.value.toLocaleString("pt-BR")}</p>
                {k.hint && <p className="mt-1 truncate text-[11px] text-muted-foreground">{k.hint}</p>}
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>

      </QueryState>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "aprovacao" | "fila")}>
        <TabsList>
          <TabsTrigger value="aprovacao" className="gap-2"><ShieldCheck className="h-3.5 w-3.5" />Aguardando aprovação{(stats?.waiting_approval ?? 0) > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{stats?.waiting_approval}</Badge>}</TabsTrigger>
          <TabsTrigger value="fila" className="gap-2"><ListOrdered className="h-3.5 w-3.5" />Itens da fila</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "aprovacao" ? <AprovacaoTab /> : (<>
      {processedFrom && <div className="text-sm">Concluídos desde {new Date(processedFrom).toLocaleString("pt-BR")} <Button variant="ghost" onClick={() => { const next = new URLSearchParams(params); next.delete("processed_from"); setParams(next); }}>Limpar período</Button></div>}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nome, e-mail, login, origem ou correlation ID…" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={statusKey} onValueChange={(v) => setFilter("status", v)}>
          <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={(v) => setFilter("action", v)}>
          <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as ações</SelectItem>
            {(filters?.actions ?? []).map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={originFilter} onValueChange={(v) => setFilter("origem", v)}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as origens</SelectItem>
            {(filters?.origins ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <QueryState loading={isLoading || isPlaceholderData} error={pageError} retry={retryPage}>
      <div className="flex items-start gap-5">
      <Card className="min-w-0 flex-1">
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : groups.length === 0 ? (
            <div className="py-10"><EmptyState message="Nenhum item com esses filtros." /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="p-4 font-medium">Usuário</th>
                  <th className="p-4 font-medium">Progresso</th>
                  <th className="hidden p-4 font-medium md:table-cell">Status</th>
                  <th className="hidden p-4 font-medium lg:table-cell">Solicitado em</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const st = QUEUE_STATUS_META[g.status];
                  const ini = g.who.split(/[\s.@]+/).filter(Boolean).map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <tr key={g.key} onClick={() => setSelectedKey(selectedKey === g.key ? null : g.key)}
                      className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${selectedKey === g.key ? "bg-primary/5" : ""}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{ini || "?"}</span>
                          <div className="min-w-0"><p className="truncate font-semibold">{g.who}</p><p className="truncate text-xs text-muted-foreground">{g.email}</p></div>
                        </div>
                      </td>
                      <td className="p-4"><Steps steps={g.steps} /></td>
                      <td className="hidden p-4 md:table-cell"><Badge variant="outline" className={st?.className}>{g.status === "processing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{statusLabel(g.status)}</Badge></td>
                      <td className="hidden p-4 text-muted-foreground lg:table-cell">{new Date(g.created).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {selected && (
        <DetailPanel onClose={() => setSelectedKey(null)}>
          <p className="pr-8 text-lg font-semibold">{selected.who}</p>
          <p className="text-sm text-muted-foreground">{selected.email}</p>
          <div className="mt-4"><Steps steps={selected.steps} /></div>
          <p className="mb-3 mt-6 text-sm font-semibold">Ações ({selected.items.length})</p>
          <ol className="relative space-y-4 border-l pl-5">
            {selected.items.map((item: Row) => {
              const st = QUEUE_STATUS_META[item.status];
              const resource = resolveName(item, "");
              return (
                <li key={item.id} className="relative">
                  <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-card ${STEP_DOT[item.status] ?? "bg-muted-foreground"}`} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{actionLabel(item.action_type)}</span>
                    <Badge variant="outline" className={`text-[10px] ${st?.className}`}>{statusLabel(item.status)}</Badge>
                  </div>
                  {resource && <p className="truncate text-xs text-muted-foreground">{resource}</p>}
                  <p className="text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")} · {item.requested_by || "—"}{item.retry_count ? ` · ${item.retry_count} tentativa(s)` : ""}</p>
                  {(item.error_code || (item.status === "failed" && item.result_message)) && (
                    <p className="mt-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{item.error_code ? queueErrorLabel(item.error_code) : ""}{item.error_code && item.result_message ? " · " : ""}{item.result_message}</p>
                  )}
                  <div className="mt-1.5 flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild><Link to={`/fila-provisionamento/${item.id}`}><Eye className="mr-1 h-3 w-3" />Detalhes</Link></Button>
                    {canEdit && item.status === "failed" && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" disabled={reprocess.isPending} onClick={() => reprocess.mutate(item.id)}><RotateCcw className="mr-1 h-3 w-3" />Reenviar</Button>}
                    {canEdit && item.status === "waiting_approval" && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-info" asChild><Link to={`/fila-provisionamento?tab=aprovacao&q=${encodeURIComponent(item.target_identity || "")}`}><ShieldCheck className="mr-1 h-3 w-3" />Decidir</Link></Button>}
                    {canEdit && ["pending", "waiting_approval"].includes(item.status) && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setCancelTarget(item)}><Ban className="mr-1 h-3 w-3" />Cancelar</Button>}
                  </div>
                </li>
              );
            })}
          </ol>
          {selected.personLink && <Button variant="outline" className="mt-6 w-full" asChild><Link to={selected.personLink}>Abrir ficha da pessoa</Link></Button>}
        </DetailPanel>
      )}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">{total.toLocaleString("pt-BR")} ação(ões) · {groups.length} pessoa(s) nesta página</span>
        <TablePagination totalItems={total} pageSize={pageSize} currentPage={page} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>
      </QueryState>
      </>)}

      <AlertDialog open={reprocessAllOpen} onOpenChange={setReprocessAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocessar todas as falhas?</AlertDialogTitle>
            <AlertDialogDescription>{stats?.failed ?? 0} item(ns) com falha voltam para "pendente" e serão executados novamente pelo Órigo Agente na próxima leitura da fila. Corrija a causa (ex.: permissão, identidade) antes de reprocessar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reprocessAll}>Reprocessar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmImpactDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}
        title={`Cancelar ação de ${cancelTarget?.payload_json?.displayName || cancelTarget?.target_identity || "item"}?`}
        description="O Hermes não executará este item."
        impacts={cancelTarget ? [{ icon: Ban, title: actionLabel(cancelTarget.action_type), detail: resolveName(cancelTarget, "") || undefined }] : []}
        cancelLabel="Voltar" confirmLabel="Cancelar item" confirmIcon={Ban}
        onConfirm={() => { if (cancelTarget) cancel.mutate({ queueId: cancelTarget.id, motivo: "Cancelado na fila" }); setCancelTarget(null); }} />
    </div>
  );
}
