import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const mock = {
  id: "1", nome: "Revisão SAP Q1 2026", tipo: "por_aplicacao", status: "em_andamento",
  total: 28, decididos: 18, dataInicio: "01/03/2026", dataLimite: "31/03/2026", criadaPor: "João IAM",
};

const mockItens = [
  { id: "1", pessoa: "Carlos Souza", app: "SAP ERP", acesso: "Consultor SAP", decisao: "manter", decidido: "Maria Owner", data: "05/03/2026" },
  { id: "2", pessoa: "Fernanda Lima", app: "SAP ERP", acesso: "Analista Financeiro", decisao: "manter", decidido: "Maria Owner", data: "05/03/2026" },
  { id: "3", pessoa: "Roberto Almeida", app: "SAP ERP", acesso: "Admin SAP", decisao: "revogar", decidido: "João IAM", data: "08/03/2026" },
  { id: "4", pessoa: "Ana Silva", app: "SAP ERP", acesso: "Leitura SAP", decisao: "pendente", decidido: null, data: null },
  { id: "5", pessoa: "Pedro Costa", app: "SAP ERP", acesso: "Dev SAP ABAP", decisao: "pendente", decidido: null, data: null },
];

const decisaoColors: Record<string, string> = {
  manter: "bg-success/15 text-success border-success/30",
  revogar: "bg-destructive/15 text-destructive border-destructive/30",
  pendente: "bg-muted text-muted-foreground",
};

export default function RevisaoDetalhePage() {
  const { id } = useParams();
  const progress = (mock.decididos / mock.total) * 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/revisoes"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{mock.nome}</h1>
            <Badge variant="outline" className="bg-info/15 text-info border-info/30">Em andamento</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Criada por {mock.criadaPor} · {mock.dataInicio} → {mock.dataLimite}</p>
        </div>
      </div>

      <Card><CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Progresso: {mock.decididos} de {mock.total} itens</span>
          <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3" />
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Pessoa</th><th className="p-4 font-medium">Aplicação</th>
          <th className="p-4 font-medium">Acesso Atual</th><th className="p-4 font-medium">Decisão</th>
          <th className="p-4 font-medium">Decidido por</th><th className="p-4 font-medium">Data</th>
          <th className="p-4 font-medium">Ações</th>
        </tr></thead><tbody>
          {mockItens.map((it) => (
            <tr key={it.id} className="border-b last:border-0">
              <td className="p-4 font-medium text-primary">{it.pessoa}</td>
              <td className="p-4 text-muted-foreground">{it.app}</td>
              <td className="p-4 text-muted-foreground">{it.acesso}</td>
              <td className="p-4"><Badge variant="outline" className={decisaoColors[it.decisao]}>{it.decisao}</Badge></td>
              <td className="p-4 text-muted-foreground">{it.decidido || "—"}</td>
              <td className="p-4 text-muted-foreground text-xs">{it.data || "—"}</td>
              <td className="p-4">{it.decisao === "pendente" && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-success" title="Manter"><Check className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Revogar"><X className="h-3 w-3" /></Button>
                </div>
              )}</td>
            </tr>
          ))}
        </tbody></table>
      </CardContent></Card>
    </div>
  );
}
