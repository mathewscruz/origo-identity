import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useRevisao, useRevisaoItens } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

const decisaoColors: Record<string, string> = {
  manter: "bg-success/15 text-success border-success/30",
  revogar: "bg-destructive/15 text-destructive border-destructive/30",
};

export default function RevisaoDetalhePage() {
  const { id } = useParams();
  const { data: revisao, isLoading } = useRevisao(id);
  const { data: itens } = useRevisaoItens(id);
  const [search, setSearch] = useState("");

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!revisao) return <div className="p-8 text-center text-muted-foreground">Revisão não encontrada.</div>;

  const progress = revisao.total_itens > 0 ? (revisao.itens_revisados / revisao.total_itens) * 100 : 0;
  const mantidos = (itens || []).filter((it: any) => it.decisao === "manter").length;
  const revogados = (itens || []).filter((it: any) => it.decisao === "revogar").length;
  const pendentes = (itens || []).filter((it: any) => !it.decisao).length;
  const reviewToken = (revisao as any).token;
  const externalUrl = reviewToken ? `${window.location.origin}/revisao-externa/${reviewToken}` : null;
  const isConcluida = revisao.status === "concluida";

  const filteredItens = (itens || []).filter((it: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (it.colaborador_nome || "").toLowerCase().includes(s) || (it.perfil_nome || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/revisoes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{revisao.nome}</h1>
            <Badge variant="outline" className={isConcluida ? "bg-success/15 text-success border-success/30" : "bg-info/15 text-info border-info/30"}>{revisao.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Responsável: {revisao.responsavel} · {revisao.data_inicio ? new Date(revisao.data_inicio).toLocaleDateString("pt-BR") : ""} → {revisao.data_fim ? new Date(revisao.data_fim).toLocaleDateString("pt-BR") : "sem prazo"}</p>
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Pessoa</th><th className="p-4 font-medium">Perfil</th>
          <th className="p-4 font-medium">Decisão</th><th className="p-4 font-medium">Decidido em</th>
        </tr></thead><tbody>
          {filteredItens.map((it: any) => (
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
            </tr>
          ))}
        </tbody></table>
      </CardContent></Card>
    </div>
  );
}
