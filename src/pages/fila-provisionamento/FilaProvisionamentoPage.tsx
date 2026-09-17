import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, CheckCircle2, Clock, ListOrdered, Loader2, RotateCcw, Search, ShieldCheck, XCircle, Ban, Eye } from "lucide-react";
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
import StatCard from "@/components/StatCard";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
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
  { value: "abertos", label: "Abertos", statuses: ["waiting_approval", "pending", "processing"] },
  { value: "waiting_approval", label: "Aguardando aprovação", statuses: ["waiting_approval"] },
  { value: "pending", label: "Pendente (agente)", statuses: ["pending"] },
  { value: "processing", label: "Executando", statuses: ["processing"] },
  { value: "failed", label: "Falhou", statuses: ["failed"] },
  { value: "success", label: "Concluído", statuses: ["success"] },
  { value: "cancelled", label: "Cancelado / recusado", statuses: ["cancelled", "rejected"] },
  { value: "todos", label: "Todos", statuses: [] },
];

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
  const actionFilter = params.get("action") || "todos";
  const originFilter = params.get("origem") || "todos";
  const [busca, setBusca] = useState(params.get("q") || "");
  const [buscaDebounced, setBuscaDebounced] = useState(busca);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [reprocessAllOpen, setReprocessAllOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);

  useEffect(() => { const t = setTimeout(() => setBuscaDebounced(busca.trim()), 300); return () => clearTimeout(t); }, [busca]);
  useEffect(() => { setPage(1); }, [statusKey, actionFilter, originFilter, buscaDebounced]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "todos" || (key === "status" && value === "abertos")) next.delete(key); else next.set(key, value);
    next.set("tab", "fila");
    setParams(next, { replace: true });
  };

  const statuses = STATUS_FILTERS.find((f) => f.value === statusKey)?.statuses ?? [];
  const { data: stats, isLoading: statsLoading } = useQueueStats();
  const tab: "aprovacao" | "fila" = tabParam === "fila" || tabParam === "aprovacao" ? tabParam : (params.get("status") || params.get("action") || params.get("origem") ? "fila" : "aprovacao");
  const setTab = (t: "aprovacao" | "fila") => { const next = new URLSearchParams(params); next.set("tab", t); if (t === "aprovacao") { next.delete("status"); } setParams(next, { replace: true }); };
  const { data: agents } = useAgentStatus();
  const { data: pageData, isLoading } = useQueuePage({ page, pageSize, status: statuses, actionType: actionFilter !== "todos" ? actionFilter : undefined, requestedBy: originFilter !== "todos" ? originFilter : undefined, search: buscaDebounced || undefined });
  const { data: filters } = useQueueDistinctActions(statuses.length ? statuses : ["waiting_approval", "pending", "processing", "success", "failed", "cancelled", "rejected"]);
  const reprocess = useReprocessQueueItem();
  const cancel = useCancelQueueItem();

  const rows: Row[] = pageData?.rows ?? [];
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
    { key: "pending", label: "Pendente (agente)", value: stats?.pending ?? 0, icon: Clock, tone: "warning" as const, hint: stats?.oldest_pending ? `mais antigo ${relTime(stats.oldest_pending)}${stats.retry_scheduled ? ` · ${stats.retry_scheduled} com retry agendado` : ""}` : undefined },
    { key: "processing", label: "Executando", value: stats?.processing ?? 0, icon: Loader2, tone: "primary" as const },
    { key: "failed", label: "Falhou", value: stats?.failed ?? 0, icon: XCircle, tone: "destructive" as const },
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <StatCard key={k.key} label={k.label} value={k.value} hint={k.hint} icon={k.icon} tone={k.tone} loading={statsLoading}
            active={k.key === "waiting_approval" ? tab === "aprovacao" : tab === "fila" && statusKey === k.key}
            onClick={() => k.key === "waiting_approval" ? setTab("aprovacao") : setFilter("status", tab === "fila" && statusKey === k.key ? "abertos" : k.key)} />
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "aprovacao" | "fila")}>
        <TabsList>
          <TabsTrigger value="aprovacao" className="gap-2"><ShieldCheck className="h-3.5 w-3.5" />Aguardando aprovação{(stats?.waiting_approval ?? 0) > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{stats?.waiting_approval}</Badge>}</TabsTrigger>
          <TabsTrigger value="fila" className="gap-2"><ListOrdered className="h-3.5 w-3.5" />Itens da fila</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "aprovacao" ? <AprovacaoTab /> : (<>
      <div data-tour="search-filter" className="flex flex-wrap gap-2">
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

      <Card data-tour="table">
        <CardContent className="p-0">
          {isLoading && rows.length === 0 ? (
            <div className="space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="py-10"><EmptyState message="Nenhum item com esses filtros." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 font-medium">Ação</th>
                    <th className="p-3 font-medium">Pessoa / conta</th>
                    <th className="p-3 font-medium hidden lg:table-cell">Recurso</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium hidden md:table-cell">Origem</th>
                    <th className="p-3 font-medium hidden md:table-cell">Criado</th>
                    <th className="p-3 font-medium hidden xl:table-cell">Resultado</th>
                    <th className="p-3 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const st = QUEUE_STATUS_META[item.status];
                    const who = item.payload_json?.displayName || item.target_identity || "—";
                    const resource = resolveName(item, "");
                    const retryHint = item.status === "pending" && item.next_retry_at && new Date(item.next_retry_at) > new Date() ? `retry ${item.retry_count}/${item.max_retries ?? 10} · ${new Date(item.next_retry_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : null;
                    const personLink = item.colaborador_id ? `/colaboradores/${item.colaborador_id}` : item.terceiro_id ? `/terceiros/${item.terceiro_id}` : null;
                    return (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className={`whitespace-nowrap text-xs ${actionBadgeClass(item.action_type)}`}>{actionLabel(item.action_type)}</Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">{actionScope(item.action_type)}</Badge>
                          </div>
                        </td>
                        <td className="p-3">
                          {personLink ? <Link to={personLink} className="font-medium text-primary hover:underline">{who}</Link> : <span className="font-medium">{who}</span>}
                          {item.target_identity && item.target_identity !== who && <div className="font-mono text-[11px] text-muted-foreground">{item.target_identity}</div>}
                        </td>
                        <td className="p-3 hidden lg:table-cell max-w-[260px] truncate text-muted-foreground">{resource || "—"}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={st?.className}>{item.status === "processing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{statusLabel(item.status)}</Badge>
                          {retryHint && <div className="mt-0.5 text-[10px] text-muted-foreground">{retryHint}</div>}
                          {item.status === "processing" && item.claim_owner && <div className="mt-0.5 text-[10px] text-muted-foreground">{item.claim_owner}</div>}
                        </td>
                        <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">{item.requested_by || "—"}</td>
                        <td className="p-3 hidden md:table-cell text-xs text-muted-foreground" title={new Date(item.created_at).toLocaleString("pt-BR")}>{relTime(item.created_at)}</td>
                        <td className="p-3 hidden xl:table-cell max-w-[280px] truncate text-xs text-muted-foreground" title={item.result_message || ""}>
                          {item.error_code && <span className="mr-1 font-mono text-destructive">{item.error_code}</span>}{item.result_message || "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" asChild><Link to={`/fila-provisionamento/${item.id}`}><Eye className="h-3.5 w-3.5" /></Link></Button></TooltipTrigger><TooltipContent>Detalhes</TooltipContent></Tooltip>
                            {canEdit && item.status === "failed" && (
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-primary" disabled={reprocess.isPending} onClick={() => reprocess.mutate(item.id)}><RotateCcw className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Reenviar ao agente</TooltipContent></Tooltip>
                            )}
                            {canEdit && item.status === "waiting_approval" && (
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-info" asChild><Link to={`/fila-provisionamento?tab=aprovacao&q=${encodeURIComponent(item.target_identity || "")}`}><ShieldCheck className="h-3.5 w-3.5" /></Link></Button></TooltipTrigger><TooltipContent>Decidir (aba Aguardando aprovação)</TooltipContent></Tooltip>
                            )}
                            {canEdit && ["pending", "waiting_approval"].includes(item.status) && (
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setCancelTarget(item)}><Ban className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Cancelar</TooltipContent></Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">{total.toLocaleString("pt-BR")} item(ns)</span>
        <TablePagination totalItems={total} pageSize={pageSize} currentPage={page} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>
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

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar item da fila?</AlertDialogTitle>
            <AlertDialogDescription>{cancelTarget ? `${actionLabel(cancelTarget.action_type)} — ${cancelTarget.payload_json?.displayName || cancelTarget.target_identity}. O item não será executado.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (cancelTarget) cancel.mutate({ queueId: cancelTarget.id, motivo: "Cancelado na fila" }); setCancelTarget(null); }}>Cancelar item</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OnboardingTour pageKey="fila_provisionamento" steps={tourSteps.fila_provisionamento} />
    </div>
  );
}
