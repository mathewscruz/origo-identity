import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, RotateCcw, ShieldCheck, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useCancelQueueItem, useReprocessQueueItem } from "@/hooks/mutations/useQueueActions";
import { useCanEdit } from "@/hooks/useRole";
import { useResourceNameResolver } from "@/lib/resourceNames";
import { actionBadgeClass, actionLabel, actionScope, QUEUE_STATUS_META, statusLabel } from "@/lib/queueLabels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const fmt = (iso?: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "—");

export default function SolicitacaoDetalhePage() {
  const { id } = useParams();
  const canEdit = useCanEdit();
  const resolveName = useResourceNameResolver();
  const reprocess = useReprocessQueueItem();
  const cancel = useCancelQueueItem();

  const { data: item, isLoading } = useQuery({
    queryKey: ["iam_queue_item", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("iam_queue").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const { data: approver } = useQuery({
    queryKey: ["profiles_approver", item?.approved_by],
    enabled: !!item?.approved_by,
    queryFn: async () => { const { data } = await supabase.from("profiles").select("nome, email").eq("id", item!.approved_by).maybeSingle(); return data; },
  });

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!item) return <div className="p-8 text-center text-muted-foreground">Item não encontrado.</div>;

  const st = QUEUE_STATUS_META[item.status];
  const resource = resolveName(item, "");
  const who = item.payload_json?.displayName || item.target_identity || "—";
  const personLink = item.colaborador_id ? `/colaboradores/${item.colaborador_id}` : item.terceiro_id ? `/terceiros/${item.terceiro_id}` : null;
  const { displayName: _d, mail: _m, samAccountName: _s, entra_id: _e, ...payloadRest } = item.payload_json || {};
  void _d; void _m; void _s; void _e;

  return (
    <div className="space-y-6">
      <PageHeader
        leading={<Button variant="ghost" size="icon" asChild><Link to="/fila-provisionamento"><ArrowLeft className="h-4 w-4" /></Link></Button>}
        title={actionLabel(item.action_type)}
        description={<span className="font-mono text-xs">{item.correlation_id}</span>}
        actions={
          <>
            <Badge variant="outline" className={st?.className}>{item.status === "processing" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{statusLabel(item.status)}</Badge>
            {canEdit && item.status === "failed" && <Button variant="outline" size="sm" disabled={reprocess.isPending} onClick={() => reprocess.mutate(item.id)}><RotateCcw className="mr-1 h-4 w-4" />Reenviar ao agente</Button>}
            {canEdit && item.status === "waiting_approval" && <Button size="sm" asChild><Link to={`/fila-provisionamento?tab=aprovacao&q=${encodeURIComponent(item.target_identity || "")}`}><ShieldCheck className="mr-1 h-4 w-4" />Decidir</Link></Button>}
            {canEdit && ["pending", "waiting_approval"].includes(item.status) && <Button variant="outline" size="sm" className="text-destructive" onClick={() => cancel.mutate({ queueId: item.id, motivo: "Cancelado no detalhe" })}><Ban className="mr-1 h-4 w-4" />Cancelar</Button>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">O que será feito</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={actionBadgeClass(item.action_type)}>{actionLabel(item.action_type)}</Badge>
              <Badge variant="outline">{actionScope(item.action_type)}</Badge>
            </div>
            <div><p className="text-xs text-muted-foreground">Pessoa / conta</p>{personLink ? <Link to={personLink} className="font-medium text-primary hover:underline">{who}</Link> : <p className="font-medium">{who}</p>}<p className="font-mono text-xs text-muted-foreground">{item.target_identity || "—"}</p></div>
            {resource && <div><p className="text-xs text-muted-foreground">Recurso</p><p className="font-medium">{resource}</p></div>}
            {item.resource_key && <div><p className="text-xs text-muted-foreground">Chave do recurso</p><p className="font-mono text-xs">{item.resource_key}</p></div>}
            {item.payload_json?.reason && <div><p className="text-xs text-muted-foreground">Motivo</p><p>{String(item.payload_json.reason).replace(/_/g, " ")}</p></div>}
            <div><p className="text-xs text-muted-foreground">Origem</p><p>{item.requested_by || "—"}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Linha do tempo</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Criado</span><span>{fmt(item.created_at)}</span></div>
            {item.approved_at && <div className="flex justify-between"><span className="text-muted-foreground">Aprovado</span><span>{fmt(item.approved_at)}{approver ? ` · ${approver.nome || approver.email}` : ""}</span></div>}
            {item.rejection_reason && <div className="flex justify-between"><span className="text-muted-foreground">Recusa</span><span className="text-destructive">{item.rejection_reason}</span></div>}
            {item.claimed_at && <div className="flex justify-between"><span className="text-muted-foreground">Reservado pelo agente</span><span>{fmt(item.claimed_at)}{item.claim_owner ? ` · ${item.claim_owner}` : ""}</span></div>}
            {item.status === "processing" && item.lease_expires_at && <div className="flex justify-between"><span className="text-muted-foreground">Reserva expira</span><span>{fmt(item.lease_expires_at)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Processado</span><span>{item.processed_at ? `${fmt(item.processed_at)}${item.processed_by ? ` · ${item.processed_by}` : ""}` : "aguardando o agente"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tentativas</span><span>{item.retry_count || 0} / {item.max_retries || 10}</span></div>
            {item.next_retry_at && <div className="flex justify-between"><span className="text-muted-foreground">Próxima tentativa</span><span>{fmt(item.next_retry_at)}</span></div>}
            <div className="pt-2">
              <p className="mb-1 text-xs text-muted-foreground">Resultado</p>
              {item.result_message || item.error_code ? (
                <div className={`rounded-md p-3 text-sm ${item.status === "failed" ? "bg-destructive/10 text-destructive" : item.status === "success" ? "bg-success/10 text-success" : "bg-muted"}`}>
                  {item.error_code && <span className="mr-2 font-mono text-xs">[{item.error_code}]</span>}{item.result_message}
                </div>
              ) : <p className="text-muted-foreground">Sem resultado ainda.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Payload enviado ao agente</CardTitle></CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-xs">{JSON.stringify({ target_identity: item.target_identity, ...payloadRest }, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
