import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";

const statusColors: Record<string, string> = {
  planejada: "bg-muted text-muted-foreground",
  em_andamento: "bg-info/15 text-info border-info/30",
  concluida: "bg-success/15 text-success border-success/30",
  cancelada: "bg-destructive/15 text-destructive border-destructive/30",
};
const tipoColors: Record<string, string> = {
  por_aplicacao: "bg-primary/15 text-primary border-primary/30",
  por_owner: "bg-warning/15 text-warning border-warning/30",
  por_populacao: "bg-info/15 text-info border-info/30",
  terceiros: "bg-muted text-muted-foreground",
};

const mockRevisoes = [
  { id: "1", nome: "Revisão SAP Q1 2026", tipo: "por_aplicacao", status: "em_andamento", total: 28, decididos: 18, dataLimite: "31/03/2026", criadaPor: "João IAM" },
  { id: "2", nome: "Revisão Terceiros Março", tipo: "terceiros", status: "em_andamento", total: 12, decididos: 4, dataLimite: "25/03/2026", criadaPor: "João IAM" },
  { id: "3", nome: "Revisão Apps Críticas", tipo: "por_owner", status: "planejada", total: 45, decididos: 0, dataLimite: "15/04/2026", criadaPor: "Admin" },
  { id: "4", nome: "Revisão Financeiro 2025", tipo: "por_populacao", status: "concluida", total: 34, decididos: 34, dataLimite: "31/12/2025", criadaPor: "João IAM" },
];

export default function RevisoesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revisões de Acesso</h1>
          <p className="text-sm text-muted-foreground">Campanhas periódicas de recertificação</p>
        </div>
        <Button><Plus className="mr-1 h-4 w-4" />Nova Campanha</Button>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Tipo</th>
          <th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Progresso</th>
          <th className="p-4 font-medium">Data Limite</th><th className="p-4 font-medium">Criada por</th>
        </tr></thead><tbody>
          {mockRevisoes.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="p-4"><Link to={`/revisoes/${r.id}`} className="font-medium text-primary hover:underline">{r.nome}</Link></td>
              <td className="p-4"><Badge variant="outline" className={tipoColors[r.tipo]}>{r.tipo.replace(/_/g, " ")}</Badge></td>
              <td className="p-4"><Badge variant="outline" className={statusColors[r.status]}>{r.status.replace(/_/g, " ")}</Badge></td>
              <td className="p-4 min-w-[150px]">
                <div className="flex items-center gap-2">
                  <Progress value={(r.decididos / r.total) * 100} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground">{r.decididos}/{r.total}</span>
                </div>
              </td>
              <td className="p-4 text-muted-foreground text-xs">{r.dataLimite}</td>
              <td className="p-4 text-muted-foreground">{r.criadaPor}</td>
            </tr>
          ))}
        </tbody></table>
      </CardContent></Card>
    </div>
  );
}
