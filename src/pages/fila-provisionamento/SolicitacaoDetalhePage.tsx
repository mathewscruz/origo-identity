import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "Pendente", class: "bg-warning/15 text-warning border-warning/30" },
  processing: { label: "Processando", class: "bg-info/15 text-info border-info/30" },
  success: { label: "Concluído", class: "bg-success/15 text-success border-success/30" },
  failed: { label: "Falhou", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const actionConfig: Record<string, string> = {
  create: "Criação de Usuário",
  create_if_not_exists: "Criação Automática",
  update: "Atualização de Usuário",
  disable: "Desativação de Usuário",
  delete: "Exclusão de Usuário",
  assign_group: "Atribuição de Grupo",
  remove_group: "Remoção de Grupo",
  assign_license: "Atribuição de Licença",
  remove_license: "Remoção de Licença",
};

interface QueueItem {
  id: string;
  action_type: string;
  status: string;
  payload_json: any;
  requested_by: string | null;
  created_at: string;
  processed_at: string | null;
  result_message: string | null;
  correlation_id: string;
  colaborador_id: string | null;
}

export default function SolicitacaoDetalhePage() {
  const { id } = useParams();
  const [item, setItem] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await (supabase as any).from("iam_queue").select("*").eq("id", id!).single();
      setItem(data);
      setLoading(false);
    }
    load();

    // Realtime for status updates
    const channel = supabase
      .channel(`iam_queue_${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "iam_queue", filter: `id=eq.${id}` }, (payload: any) => {
        setItem(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  if (loading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!item) return <div className="p-8 text-center text-muted-foreground">Solicitação não encontrada.</div>;

  const sCfg = statusConfig[item.status] || { label: item.status, class: "" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/fila-provisionamento"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {actionConfig[item.action_type] || item.action_type}
            </h1>
            <Badge variant="outline" className={sCfg.class}>{sCfg.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{item.correlation_id}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Info card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Ação</p>
              <p className="text-sm font-medium">{actionConfig[item.action_type] || item.action_type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Solicitante</p>
              <p className="text-sm font-medium">{item.requested_by || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data da Solicitação</p>
              <p className="text-sm font-medium">{format(new Date(item.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Data do Processamento</p>
              <p className="text-sm font-medium">
                {item.processed_at ? format(new Date(item.processed_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "Aguardando processamento"}
              </p>
            </div>
             <div>
               <p className="text-xs text-muted-foreground">Status</p>
               <Badge variant="outline" className={sCfg.class}>{sCfg.label}</Badge>
             </div>
             <div>
               <p className="text-xs text-muted-foreground">Retentativas</p>
               <p className="text-sm font-medium">
                 {(item as any).retry_count || 0} / {(item as any).max_retries || 10}
               </p>
             </div>
             {(item as any).next_retry_at && (
               <div>
                 <p className="text-xs text-muted-foreground">Próxima Tentativa</p>
                 <p className="text-sm font-medium">
                   {format(new Date((item as any).next_retry_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                 </p>
               </div>
             )}
             {item.error_code && (
               <div>
                 <p className="text-xs text-muted-foreground">Código de Erro</p>
                 <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 font-mono">{item.error_code}</Badge>
               </div>
             )}
             <div>
               <p className="text-xs text-muted-foreground">Correlation ID</p>
               <p className="text-sm font-mono">{item.correlation_id}</p>
             </div>
             {item.colaborador_id && (
               <div>
                 <p className="text-xs text-muted-foreground">Colaborador</p>
                 <Link to={`/colaboradores/${item.colaborador_id}`} className="text-sm text-primary hover:underline">
                   Ver colaborador →
                 </Link>
               </div>
             )}
          </CardContent>
        </Card>

        {/* Result card */}
        <Card>
          <CardHeader><CardTitle className="text-base">Resultado</CardTitle></CardHeader>
          <CardContent>
            {item.result_message ? (
              <div className={`rounded-md p-4 text-sm ${item.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                {item.result_message}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aguardando processamento pelo agente.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payload card */}
      <Card>
        <CardHeader><CardTitle className="text-base">Payload (Dados da Solicitação)</CardTitle></CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-4 text-xs font-mono overflow-auto max-h-96">
            {JSON.stringify(item.payload_json, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
