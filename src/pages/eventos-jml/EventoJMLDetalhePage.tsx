import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { useEventoJML } from "@/hooks/useOrigoData";
import { useReprocessQueueItem } from "@/hooks/mutations/useQueueActions";
import { useResourceNameResolver } from "@/lib/resourceNames";
import { actionLabel, actionScope, JML_ORIGEM_LABELS, JML_TIPO_META, QUEUE_STATUS_META, statusLabel } from "@/lib/queueLabels";
import { supabase } from "@/integrations/supabase/client";
import { useCanEdit } from "@/hooks/useRole";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/**
 * Itens da fila gerados por este evento: mesma identidade e janela de tempo em
 * torno da criação do evento (os RPCs de JML gravam evento e fila na mesma transação).
 */
function useEventoQueue(evento: Row | undefined) {
  return useQuery({
    queryKey: ["evento_queue", evento?.id],
    enabled: !!evento && !!(evento.colaborador_id || evento.terceiro_id),
    queryFn: async () => {
      const base = new Date(evento.created_at).getTime();
      let q = (supabase as Row).from("iam_queue").select("*").gte("created_at", new Date(base - 2 * 60_000).toISOString()).lte("created_at", new Date(base + 10 * 60_000).toISOString()).order("created_at", { ascending: true });
      q = evento.colaborador_id ? q.eq("colaborador_id", evento.colaborador_id) : q.eq("terceiro_id", evento.terceiro_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

const fmtVal = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function EventoJMLDetalhePage() {
  const { id } = useParams();
  const canEdit = useCanEdit();
  const resolveName = useResourceNameResolver();
  const { data: evento, isLoading } = useEventoJML(id);
  const { data: queueRows } = useEventoQueue(evento);
  const reprocessItem = useReprocessQueueItem();

  const bySystem = useMemo(() => {
    const groups: Record<string, Row[]> = {};
    for (const r of queueRows ?? []) { const k = actionScope(r.action_type); (groups[k] ||= []).push(r); }
    return groups;
  }, [queueRows]);
  const stats = useMemo(() => {
    const rows = queueRows ?? [];
    return {
      total: rows.length,
      done: rows.filter((r) => r.status === "success").length,
      open: rows.filter((r) => ["pending", "processing", "waiting_approval"].includes(r.status)).length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
  }, [queueRows]);

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!evento) return <EmptyState message="Evento não encontrado." />;

  const antes = (evento.dados_antes as Record<string, unknown>) || {};
  const depois = (evento.dados_depois as Record<string, unknown>) || {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((c) => !["perfis", "recursos_individuais", "terceiro_id"].includes(c));
  const alterados = campos.filter((c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c]));
  const tipo = JML_TIPO_META[evento.tipo];
  const personLink = evento.colaborador_id ? `/colaboradores/${evento.colaborador_id}` : evento.terceiro_id ? `/terceiros/${evento.terceiro_id}` : null;

  const reprocessFailed = async () => {
    const ids = (queueRows ?? []).filter((r) => r.status === "failed").map((r) => r.id);
    if (!ids.length) return;
    const { data, error } = await supabase.rpc("iam_queue_reprocessar", { p_ids: ids });
    if (error) toast.error("Erro ao reprocessar", { description: error.message });
    else toast.success(`${data ?? 0} item(ns) devolvido(s) à fila do agente`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        leading={<Button variant="ghost" size="icon" asChild><Link to="/eventos-jml"><ArrowLeft className="h-4 w-4" /></Link></Button>}
        title={`${tipo?.label || evento.tipo} — ${evento.colaborador_nome || "—"}`}
        description={<>
          {personLink ? <Link to={personLink} className="text-primary hover:underline">{evento.colaborador_nome}</Link> : evento.colaborador_nome}
          {" · "}{new Date(evento.created_at).toLocaleString("pt-BR")}{" · origem: "}<span className="font-medium">{JML_ORIGEM_LABELS[evento.origem] || evento.origem || "—"}</span>
          {depois.operador ? <> · por <span className="font-medium">{String(depois.operador)}</span></> : null}
        </>}
        actions={<>
          <Badge className={`${tipo?.className || "bg-muted"} text-[10px] uppercase`}>{tipo?.label || evento.tipo}</Badge>
          {canEdit && stats.failed > 0 && <Button variant="outline" size="sm" onClick={reprocessFailed}><RefreshCw className="mr-1 h-3 w-3" />Reprocessar {stats.failed} falha(s)</Button>}
        </>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ações geradas" value={stats.total} />
        <StatCard label="Concluídas" value={stats.done} icon={CheckCircle2} tone="success" />
        <StatCard label="Em aberto" value={stats.open} icon={Clock} tone="warning" hint="aguardando aprovação ou o agente" />
        <StatCard label="Com falha" value={stats.failed} icon={AlertCircle} tone={stats.failed > 0 ? "destructive" : "default"} />
      </div>

      {evento.erro_mensagem && (
        <Card className="border-warning/40 bg-warning/5"><CardContent className="flex items-start gap-2 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><div><p className="font-medium">Observação</p><p className="text-muted-foreground">{evento.erro_mensagem}</p></div>
        </CardContent></Card>
      )}

      <Tabs defaultValue="acoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="acoes">Ações de provisionamento ({stats.total})</TabsTrigger>
          <TabsTrigger value="snapshot">Antes / depois ({alterados.length} alterado{alterados.length === 1 ? "" : "s"})</TabsTrigger>
        </TabsList>

        <TabsContent value="acoes" className="space-y-4">
          {stats.total === 0 ? (
            <Card><CardContent className="py-8"><EmptyState message="Nenhuma ação de provisionamento vinculada a este evento (ex.: pessoa sem conta/perfis, ou evento apenas informativo)." /></CardContent></Card>
          ) : Object.entries(bySystem).map(([sistema, rows]) => (
            <Card key={sistema}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{sistema} ({rows.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 font-medium">Ação</th><th className="p-3 font-medium">Recurso</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Resultado</th><th className="w-20 p-3 font-medium"></th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="p-3 font-medium"><Link to={`/fila-provisionamento/${r.id}`} className="hover:underline">{actionLabel(r.action_type)}</Link></td>
                        <td className="p-3 text-muted-foreground">{resolveName(r, r.target_identity || "—")}</td>
                        <td className="p-3"><Badge variant="outline" className={QUEUE_STATUS_META[r.status]?.className}>{r.status === "processing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{statusLabel(r.status)}</Badge></td>
                        <td className="max-w-xs truncate p-3 text-xs text-muted-foreground" title={r.result_message || r.error_code || ""}>{r.error_code ? <span className="mr-1 font-mono text-destructive">{r.error_code}</span> : null}{r.result_message || (r.processed_at ? new Date(r.processed_at).toLocaleTimeString("pt-BR") : "—")}</td>
                        <td className="p-3">{canEdit && r.status === "failed" && <Button variant="ghost" size="sm" className="h-7" disabled={reprocessItem.isPending} onClick={() => reprocessItem.mutate(r.id)}><RefreshCw className="h-3 w-3" /></Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="snapshot">
          <Card><CardContent className="p-6">
            {campos.length === 0 ? <EmptyState message="Sem dados de antes/depois." /> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[["Antes", antes], ["Depois", depois]].map(([label, obj]) => (
                  <div key={label as string} className="rounded-lg border bg-muted/30 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">{label as string}</p>
                    <div className="space-y-2">
                      {campos.map((c) => (
                        <div key={c} className={`flex justify-between gap-3 text-sm ${alterados.includes(c) ? (label === "Antes" ? "-mx-2 rounded bg-warning/10 px-2 py-1" : "-mx-2 rounded bg-success/10 px-2 py-1 font-semibold") : ""}`}>
                          <span className="text-muted-foreground">{c.replace(/_/g, " ")}</span>
                          <span className="max-w-[60%] truncate text-right font-medium" title={fmtVal((obj as Row)[c])}>{fmtVal((obj as Row)[c])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(antes.perfis) && (antes.perfis as unknown[]).length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">{(antes.perfis as unknown[]).length} perfil(is) e {Array.isArray(antes.recursos_individuais) ? (antes.recursos_individuais as unknown[]).length : 0} recurso(s) individual(is) no snapshot — usados na restauração em caso de reativação.</p>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
