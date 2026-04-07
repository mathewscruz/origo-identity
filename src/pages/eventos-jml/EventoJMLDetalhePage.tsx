import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, RefreshCw, Trash2 } from "lucide-react";
import { useEventoJML, useEventoJMLAcoes, useEventoJMLAprovacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const tipoColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};
const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  executado: "bg-success/15 text-success border-success/30",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
};
const aprovacaoStatusColors: Record<string, string> = {
  aprovado: "bg-success text-success-foreground",
  pendente: "bg-warning text-warning-foreground",
  rejeitado: "bg-destructive text-destructive-foreground",
};

export default function EventoJMLDetalhePage() {
  const { id } = useParams();
  const { data: evento, isLoading } = useEventoJML(id);
  const { data: acoes } = useEventoJMLAcoes(id);
  const { data: aprovacoes } = useEventoJMLAprovacoes(id);
  const qc = useQueryClient();

  const handleCancelar = async () => {
    if (!id) return;
    const { error } = await supabase.from("eventos_jml").update({ status: "cancelado" as any }).eq("id", id);
    if (error) { toast.error("Erro ao cancelar evento", { description: error.message }); return; }
    toast.success("Evento cancelado com sucesso");
    qc.invalidateQueries({ queryKey: ["evento_jml", id] });
  };

  const handleReprocessar = async () => {
    if (!id) return;
    const { error } = await supabase.from("eventos_jml").update({ status: "pendente" as any, tentativas: 0 }).eq("id", id);
    if (error) { toast.error("Erro ao reprocessar", { description: error.message }); return; }
    toast.success("Evento enviado para reprocessamento");
    qc.invalidateQueries({ queryKey: ["evento_jml", id] });
  };

  const handleAprovar = async () => {
    if (!id) return;
    const { error } = await supabase.from("eventos_jml").update({ status: "executando" as any }).eq("id", id);
    if (error) { toast.error("Erro ao aprovar evento", { description: error.message }); return; }
    toast.success("Evento aprovado e enviado para execução");
    qc.invalidateQueries({ queryKey: ["evento_jml", id] });
  };

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!evento) return <div className="p-8 text-center text-muted-foreground">Evento não encontrado.</div>;

  const antes = (evento.dados_antes as Record<string, string>) || {};
  const depois = (evento.dados_depois as Record<string, string>) || {};
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
  const camposAlterados = campos.filter((c) => antes[c] !== depois[c]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/eventos-jml"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Evento #{evento.id.slice(0, 8)}</h1>
            <Badge className={`${tipoColors[evento.tipo]} text-[10px] uppercase`}>{evento.tipo.charAt(0)}</Badge>
            <Badge variant="outline" className={statusColors[evento.status] || ""}>{({ pendente: "Pendente", quarentena: "Quarentena", executando: "Executando", executado: "Executado", erro: "Erro", cancelado: "Cancelado" } as Record<string, string>)[evento.status] || evento.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{evento.colaborador_nome || "Desconhecido"} · {new Date(evento.created_at).toLocaleDateString("pt-BR")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCancelar}><Trash2 className="mr-1 h-3 w-3" />Cancelar</Button>
          <Button variant="outline" size="sm" onClick={handleReprocessar}><RefreshCw className="mr-1 h-3 w-3" />Reprocessar</Button>
          <Button size="sm" onClick={handleAprovar}><Check className="mr-1 h-3 w-3" />Aprovar</Button>
        </div>
      </div>

      {campos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Mudanças Detectadas</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
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
                    <div key={c} className={`flex justify-between text-sm ${camposAlterados.includes(c) ? "bg-warning/10 -mx-2 px-2 py-1 rounded font-semibold" : ""}`}>
                      <span className="text-muted-foreground capitalize">{c}</span>
                      <span className={camposAlterados.includes(c) ? "text-destructive font-bold" : "font-medium"}>{depois[c] || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(acoes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ações ({acoes?.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Descrição</th><th className="p-4 font-medium">Aplicação</th><th className="p-4 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {acoes?.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="p-4 font-medium">{a.descricao}</td>
                    <td className="p-4 text-muted-foreground">{a.aplicacao || "—"}</td>
                    <td className="p-4"><Badge variant="outline" className={statusColors[a.status] || ""}>{({ pendente: "Pendente", executado: "Executado", erro: "Erro" } as Record<string, string>)[a.status] || a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(aprovacoes?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cadeia de Aprovação</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {aprovacoes?.map((ap, i) => (
                <div key={ap.id} className="flex items-center gap-2">
                  {i > 0 && <div className="h-px w-8 bg-border" />}
                  <div className="flex flex-col items-center gap-1">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${aprovacaoStatusColors[ap.status] || "bg-muted"}`}>
                      {ap.status === "aprovado" ? <Check className="h-4 w-4" /> : ap.etapa}
                    </div>
                    <span className="text-xs font-medium">{ap.aprovador || "—"}</span>
                    {ap.data_decisao && <span className="text-[10px] text-muted-foreground">{new Date(ap.data_decisao).toLocaleDateString("pt-BR")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
