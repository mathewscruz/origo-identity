import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, X, ExternalLink } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useRevisao, useRevisaoItens } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const decisaoColors: Record<string, string> = {
  manter: "bg-success/15 text-success border-success/30",
  revogar: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function RevisaoDetalhePage() {
  const { id } = useParams();
  const { data: revisao, isLoading } = useRevisao(id);
  const { data: itens } = useRevisaoItens(id);
  const qc = useQueryClient();
  const { toast } = useToast();

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!revisao) return <div className="p-8 text-center text-muted-foreground">Revisão não encontrada.</div>;

  const progress = revisao.total_itens > 0 ? (revisao.itens_revisados / revisao.total_itens) * 100 : 0;
  const mantidos = (itens || []).filter((it: any) => it.decisao === "manter").length;
  const revogados = (itens || []).filter((it: any) => it.decisao === "revogar").length;
  const pendentes = (itens || []).filter((it: any) => !it.decisao).length;
  const reviewToken = (revisao as any).token;
  const externalUrl = reviewToken ? `${window.location.origin}/revisao-externa/${reviewToken}` : null;

  const handleDecisao = async (itemId: string, decisao: string) => {
    await supabase.from("revisao_itens").update({ decisao, decidido_em: new Date().toISOString() }).eq("id", itemId);
    const newRevisados = (itens || []).filter((it: any) => it.id === itemId || it.decisao).length;
    await supabase.from("revisoes").update({ itens_revisados: newRevisados }).eq("id", revisao.id);
    qc.invalidateQueries({ queryKey: ["revisao_itens", id] });
    qc.invalidateQueries({ queryKey: ["revisao", id] });
    toast({ title: `Item marcado como "${decisao}"` });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/revisoes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{revisao.nome}</h1>
            <Badge variant="outline" className="bg-info/15 text-info border-info/30">{revisao.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Responsável: {revisao.responsavel} · {revisao.data_inicio ? new Date(revisao.data_inicio).toLocaleDateString("pt-BR") : ""} → {revisao.data_fim ? new Date(revisao.data_fim).toLocaleDateString("pt-BR") : ""}</p>
        </div>
        {externalUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3 mr-1" /> Link Externo
            </a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold">{(itens || []).length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold text-success">{mantidos}</p>
          <p className="text-xs text-muted-foreground">Mantidos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold text-destructive">{revogados}</p>
          <p className="text-xs text-muted-foreground">Revogados</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <p className="text-2xl font-bold text-warning">{pendentes}</p>
          <p className="text-xs text-muted-foreground">Pendentes</p>
        </CardContent></Card>
      </div>

      <Card><CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progresso: {revisao.itens_revisados} de {revisao.total_itens} itens</span>
          <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3" />
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Pessoa</th><th className="p-4 font-medium">Perfil</th>
          <th className="p-4 font-medium">Decisão</th><th className="p-4 font-medium">Decidido em</th>
          <th className="p-4 font-medium">Ações</th>
        </tr></thead><tbody>
          {(itens ?? []).map((it: any) => (
            <tr key={it.id} className="border-b last:border-0">
              <td className="p-4 font-medium text-primary">{it.colaborador_nome || "—"}</td>
              <td className="p-4 text-muted-foreground">{it.perfil_nome || "—"}</td>
              <td className="p-4">
                {it.decisao ? (
                  <Badge variant="outline" className={decisaoColors[it.decisao] || "bg-muted text-muted-foreground"}>{it.decisao}</Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">pendente</Badge>
                )}
              </td>
              <td className="p-4 text-muted-foreground text-xs">{it.decidido_em ? new Date(it.decidido_em).toLocaleString("pt-BR") : "—"}</td>
              <td className="p-4">{!it.decisao && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-success" title="Manter" onClick={() => handleDecisao(it.id, "manter")}><Check className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Revogar" onClick={() => handleDecisao(it.id, "revogar")}><X className="h-3 w-3" /></Button>
                </div>
              )}</td>
            </tr>
          ))}
        </tbody></table>
      </CardContent></Card>
    </div>
  );
}
