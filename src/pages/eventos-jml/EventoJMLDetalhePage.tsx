import { useParams, Link } from "react-router-dom";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, RefreshCw, X, AlertCircle, CheckCircle2, Clock, Ban } from "lucide-react";
import { useEventoJML, useEventoJMLAcoes, useEventoJMLAprovacoes } from "@/hooks/useOrigoData";
import { useEventoQueue } from "@/hooks/useEventoQueue";
import { useUpdateJmlStatus } from "@/hooks/mutations/useJmlEvent";
import { useReprocessQueueItem, useReprocessQueueForIdentity } from "@/hooks/mutations/useQueueActions";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";

const tipoLabel: Record<string, string> = {
  joiner: "Joiner",
  mover: "Mover",
  leaver: "Leaver",
  pre_leaver: "Pré-Leaver",
  pre_leaver_revertido: "Pré-Leaver revertido",
};
const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
  pre_leaver: "bg-warning text-warning-foreground",
  pre_leaver_revertido: "bg-muted text-muted-foreground",
};
const statusLabel: Record<string, string> = {
  pendente: "Pendente", quarentena: "Quarentena", executando: "Executando",
  executado: "Executado", erro: "Erro", cancelado: "Cancelado",
};
const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  quarentena: "bg-warning/15 text-warning border-warning/30",
  executando: "bg-info/15 text-info border-info/30",
  executado: "bg-success/15 text-success border-success/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground border-border",
};
const queueStatusLabel: Record<string, string> = {
  pending: "Pendente", processing: "Processando", succeeded: "Sucesso",
  failed: "Falhou", permanent_failure: "Falha permanente", cancelled: "Cancelado",
};
const queueStatusColors: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  processing: "bg-info/15 text-info border-info/30",
  succeeded: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  permanent_failure: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function actionTypeLabel(at: string): string {
  const map: Record<string, string> = {
    create: "Criar conta", create_if_not_exists: "Criar conta (idempotente)",
    update: "Atualizar", disable: "Desativar", disable_entra: "Desativar Entra ID",
    enable_entra: "Reativar Entra ID", delete: "Excluir",
    assign_group: "Atribuir grupo", remove_group: "Remover grupo",
    assign_app: "Atribuir app", remove_app: "Remover app",
    assign_license: "Atribuir licença", remove_license: "Remover licença",
    reset_password: "Resetar senha",
  };
  return map[at] || at;
}

function targetFromPayload(at: string, p: any, catalogs: any): string {
  if (!p) return "—";
  return resolveResourceLabel({ action_type: at, payload_json: p }, catalogs, "—");
}


export default function EventoJMLDetalhePage() {
  const { id } = useParams();
  const { data: evento, isLoading } = useEventoJML(id);
  const { data: acoes } = useEventoJMLAcoes(id);
  const { data: aprovacoes } = useEventoJMLAprovacoes(id);
  const { data: queueRows } = useEventoQueue(id, evento?.colaborador_id ?? undefined, evento?.created_at);

  const updateStatus = useUpdateJmlStatus();
  const reprocessItem = useReprocessQueueItem();
  const reprocessAll = useReprocessQueueForIdentity();

  const queueBySystem = useMemo(() => {
    const groups: Record<string, any[]> = { "Entra ID": [], "Active Directory": [], Outros: [] };
    (queueRows ?? []).forEach((r: any) => {
      const at = r.action_type as string;
      if (at.includes("entra") || ["assign_group", "remove_group", "assign_license", "remove_license", "assign_app", "remove_app"].includes(at)) {
        groups["Entra ID"].push(r);
      } else if (["create", "create_if_not_exists", "update", "disable", "enable", "reset_password", "delete"].includes(at)) {
        groups["Active Directory"].push(r);
      } else {
        groups.Outros.push(r);
      }
    });
    return groups;
  }, [queueRows]);

  const stats = useMemo(() => {
    const rows = (queueRows ?? []) as any[];
    return {
      total: rows.length,
      done: rows.filter(r => r.status === "succeeded").length,
      pending: rows.filter(r => ["pending", "processing"].includes(r.status)).length,
      failed: rows.filter(r => ["failed", "permanent_failure"].includes(r.status)).length,
    };
  }, [queueRows]);

  if (isLoading) {
    return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  }
  if (!evento) return <EmptyState message="Evento não encontrado." />;

  const antes = (evento.dados_antes as Record<string, string>) || {};
  const depois = (evento.dados_depois as Record<string, string>) || {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
  const camposAlterados = campos.filter((c) => antes[c] !== depois[c]);
  const isFinal = ["executado", "cancelado"].includes(evento.status);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/fila-provisionamento"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">Evento #{evento.id.slice(0, 8)}</h1>
            <Badge className={`${tipoColors[evento.tipo] || "bg-muted"} text-[10px] uppercase`}>{tipoLabel[evento.tipo] || evento.tipo}</Badge>
            <Badge variant="outline" className={statusColors[evento.status] || ""}>{statusLabel[evento.status] || evento.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {evento.colaborador_id ? (
              <Link to={`/colaboradores/${evento.colaborador_id}`} className="hover:underline text-primary">
                {evento.colaborador_nome || "Desconhecido"}
              </Link>
            ) : (evento.colaborador_nome || "Desconhecido")}
            {" · "}{new Date(evento.created_at).toLocaleString("pt-BR")}
            {" · origem: "}<span className="font-medium">{evento.origem || "—"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {evento.colaborador_id && stats.failed > 0 && (
            <Button variant="outline" size="sm"
              disabled={reprocessAll.isPending}
              onClick={() => reprocessAll.mutate(evento.colaborador_id!)}>
              <RefreshCw className="mr-1 h-3 w-3" />Reprocessar {stats.failed} falha(s)
            </Button>
          )}
          {!isFinal && (
            <>
              <Button variant="outline" size="sm"
                disabled={updateStatus.isPending}
                onClick={() => updateStatus.mutate({ eventoId: evento.id, status: "cancelado" })}>
                <Ban className="mr-1 h-3 w-3" />Cancelar
              </Button>
              <Button variant="outline" size="sm"
                disabled={updateStatus.isPending}
                onClick={() => updateStatus.mutate({ eventoId: evento.id, status: "pendente", resetTentativas: true })}>
                <RefreshCw className="mr-1 h-3 w-3" />Reprocessar evento
              </Button>
              {evento.status === "pendente" && (
                <Button size="sm" disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ eventoId: evento.id, status: "executando" })}>
                  <Check className="mr-1 h-3 w-3" />Aprovar
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Cartões de progresso */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Ações enfileiradas</p>
          <p className="text-2xl font-semibold mt-1">{stats.total}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Concluídas</p>
          <p className="text-2xl font-semibold mt-1 text-success flex items-center gap-1"><CheckCircle2 className="h-5 w-5" />{stats.done}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Em andamento</p>
          <p className="text-2xl font-semibold mt-1 text-warning flex items-center gap-1"><Clock className="h-5 w-5" />{stats.pending}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Com falha</p>
          <p className="text-2xl font-semibold mt-1 text-destructive flex items-center gap-1"><AlertCircle className="h-5 w-5" />{stats.failed}</p>
        </CardContent></Card>
      </div>

      {/* Erro do evento */}
      {evento.erro_mensagem && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Erro do evento</p>
              <p className="text-muted-foreground mt-1">{evento.erro_mensagem}</p>
              {(evento.tentativas ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Tentativas: {evento.tentativas}/{evento.max_tentativas ?? 3}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="acoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="acoes">Ações de provisionamento ({stats.total})</TabsTrigger>
          {(aprovacoes?.length ?? 0) > 0 && <TabsTrigger value="aprovacoes">Aprovações ({aprovacoes?.length})</TabsTrigger>}
          {campos.length > 0 && <TabsTrigger value="snapshot">Snapshot ({camposAlterados.length} alterado{camposAlterados.length === 1 ? "" : "s"})</TabsTrigger>}
          {(acoes?.length ?? 0) > 0 && <TabsTrigger value="legacy">Ações legadas</TabsTrigger>}
        </TabsList>

        {/* Ações de provisionamento — agrupadas por sistema */}
        <TabsContent value="acoes" className="space-y-4">
          {stats.total === 0 ? (
            <EmptyState message="Nenhuma ação de provisionamento vinculada a este evento." />
          ) : (
            Object.entries(queueBySystem).map(([sistema, rows]) => {
              if (rows.length === 0) return null;
              return (
                <Card key={sistema}>
                  <CardHeader><CardTitle className="text-base">{sistema} ({rows.length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="p-3 font-medium">Ação</th>
                        <th className="p-3 font-medium">Alvo</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium">Resultado</th>
                        <th className="p-3 font-medium w-24">Operações</th>
                      </tr></thead>
                      <tbody>
                        {rows.map((r: any) => {
                          const canRetry = ["failed", "permanent_failure"].includes(r.status);
                          return (
                            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
                              <td className="p-3 font-medium">{actionTypeLabel(r.action_type)}</td>
                              <td className="p-3 text-muted-foreground">{targetFromPayload(r.action_type, r.payload_json)}</td>
                              <td className="p-3"><Badge variant="outline" className={queueStatusColors[r.status] || ""}>{queueStatusLabel[r.status] || r.status}</Badge></td>
                              <td className="p-3 text-xs text-muted-foreground max-w-xs truncate" title={r.result_message || r.error_code || ""}>
                                {r.result_message || r.error_code || (r.processed_at ? new Date(r.processed_at).toLocaleTimeString("pt-BR") : "—")}
                              </td>
                              <td className="p-3">
                                {canRetry && (
                                  <Button variant="ghost" size="sm" className="h-7"
                                    disabled={reprocessItem.isPending}
                                    onClick={() => reprocessItem.mutate(r.id)}>
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Aprovações */}
        {(aprovacoes?.length ?? 0) > 0 && (
          <TabsContent value="aprovacoes">
            <Card><CardContent className="p-6">
              <div className="flex items-center gap-2 overflow-x-auto">
                {aprovacoes!.map((ap, i) => {
                  const stColor = ap.status === "aprovado" ? "bg-success text-success-foreground" :
                                  ap.status === "rejeitado" ? "bg-destructive text-destructive-foreground" :
                                  "bg-warning text-warning-foreground";
                  return (
                    <div key={ap.id} className="flex items-center gap-2 shrink-0">
                      {i > 0 && <div className="h-px w-8 bg-border" />}
                      <div className="flex flex-col items-center gap-1 min-w-[120px]">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${stColor}`}>
                          {ap.status === "aprovado" ? <Check className="h-4 w-4" /> : ap.status === "rejeitado" ? <X className="h-4 w-4" /> : ap.etapa}
                        </div>
                        <span className="text-xs font-medium text-center">{ap.aprovador || "—"}</span>
                        {ap.data_decisao && <span className="text-[10px] text-muted-foreground">{new Date(ap.data_decisao).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>}
                        {ap.comentario && <span className="text-[10px] text-muted-foreground italic max-w-[120px] truncate" title={ap.comentario}>"{ap.comentario}"</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Snapshot */}
        {campos.length > 0 && (
          <TabsContent value="snapshot">
            <Card><CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Antes</p>
                  <div className="space-y-2">
                    {campos.map((c) => (
                      <div key={c} className={`flex justify-between text-sm ${camposAlterados.includes(c) ? "bg-warning/10 -mx-2 px-2 py-1 rounded" : ""}`}>
                        <span className="text-muted-foreground capitalize">{c}</span>
                        <span className="font-medium">{antes[c] || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Depois</p>
                  <div className="space-y-2">
                    {campos.map((c) => (
                      <div key={c} className={`flex justify-between text-sm ${camposAlterados.includes(c) ? "bg-success/10 -mx-2 px-2 py-1 rounded font-semibold" : ""}`}>
                        <span className="text-muted-foreground capitalize">{c}</span>
                        <span className={camposAlterados.includes(c) ? "text-primary font-bold" : "font-medium"}>{depois[c] || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Ações legadas (evento_jml_acoes) */}
        {(acoes?.length ?? 0) > 0 && (
          <TabsContent value="legacy">
            <Card><CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="p-3 font-medium">Descrição</th>
                  <th className="p-3 font-medium">Aplicação</th>
                  <th className="p-3 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {acoes!.map((a: any) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{a.descricao}</td>
                      <td className="p-3 text-muted-foreground">{a.aplicacao || "—"}</td>
                      <td className="p-3"><Badge variant="outline" className={queueStatusColors[a.status] || statusColors[a.status] || ""}>{queueStatusLabel[a.status] || statusLabel[a.status] || a.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
