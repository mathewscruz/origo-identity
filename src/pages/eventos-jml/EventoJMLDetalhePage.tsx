import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, X, RefreshCw, Trash2 } from "lucide-react";

const mock = {
  id: "3", tipo: "leaver", severidade: "alta", pessoa: "Maria Oliveira", pessoaId: "3",
  status: "aguardando_aprovacao", importacao: "#142",
  dataDeteccao: "16/03/2026", dataCalculo: "16/03/2026",
  antes: { cargo: "Coord. Financeiro", area: "Financeiro", status: "ativo", empresa: "Órigo Matriz", gestor: "Ana Silva" },
  depois: { cargo: "Coord. Financeiro", area: "Financeiro", status: "desligado", empresa: "Órigo Matriz", gestor: "Ana Silva" },
  camposAlterados: ["status"],
};

const mockAcoes = [
  { id: "a1", tipo: "revogar_perfil", app: "SAP ERP", perfil: "Analista Financeiro", regra: "Financeiro → SAP + BI", status: "pendente", tentativas: 0 },
  { id: "a2", tipo: "revogar_perfil", app: "Microsoft 365", perfil: "Acesso Básico Office 365", regra: "Todos CLT → Office Básico", status: "pendente", tentativas: 0 },
  { id: "a3", tipo: "revogar_licenca", app: "SAP ERP", perfil: "Licença SAP Professional", regra: "Financeiro → SAP + BI", status: "pendente", tentativas: 0 },
  { id: "a4", tipo: "remover_grupo", app: "Microsoft 365", perfil: "GRP-ALL-M365", regra: "Todos CLT → Office Básico", status: "pendente", tentativas: 0 },
  { id: "a5", tipo: "revogar_perfil", app: "Leitura BI", perfil: "Leitura BI", regra: "Financeiro → SAP + BI", status: "pendente", tentativas: 0 },
];

const mockAprovacoes = [
  { ordem: 1, aprovador: "Maria Owner", perfil: "Dono App (SAP)", status: "aprovado", data: "16/03/2026 14:30" },
  { ordem: 2, aprovador: "João IAM", perfil: "Admin IAM", status: "pendente", data: null },
];

const tipoAcaoLabels: Record<string, string> = {
  conceder_perfil: "Conceder Perfil", revogar_perfil: "Revogar Perfil",
  conceder_licenca: "Conceder Licença", revogar_licenca: "Revogar Licença",
  adicionar_grupo: "Adicionar Grupo", remover_grupo: "Remover Grupo",
};
const tipoAcaoColors: Record<string, string> = {
  conceder_perfil: "bg-success/15 text-success border-success/30",
  revogar_perfil: "bg-destructive/15 text-destructive border-destructive/30",
  conceder_licenca: "bg-success/15 text-success border-success/30",
  revogar_licenca: "bg-destructive/15 text-destructive border-destructive/30",
  adicionar_grupo: "bg-info/15 text-info border-info/30",
  remover_grupo: "bg-warning/15 text-warning border-warning/30",
};
const acaoStatusColors: Record<string, string> = {
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
  const campos = Object.keys(mock.antes) as (keyof typeof mock.antes)[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/eventos-jml"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Evento #{mock.id}</h1>
            <Badge className="bg-destructive text-destructive-foreground text-[10px] uppercase">L</Badge>
            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Severidade Alta</Badge>
            <Badge variant="outline" className="bg-info/15 text-info border-info/30">Aguard. Aprovação</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{mock.pessoa} · Detectado {mock.dataDeteccao} · Importação {mock.importacao}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Trash2 className="mr-1 h-3 w-3" />Cancelar</Button>
          <Button variant="outline" size="sm"><RefreshCw className="mr-1 h-3 w-3" />Reprocessar</Button>
          <Button size="sm"><Check className="mr-1 h-3 w-3" />Aprovar</Button>
        </div>
      </div>

      {/* Card comparativo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Mudanças Detectadas</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Antes</p>
              <div className="space-y-2">
                {campos.map((c) => (
                  <div key={c} className={`flex justify-between text-sm ${mock.camposAlterados.includes(c) ? "bg-warning/10 -mx-2 px-2 py-1 rounded" : ""}`}>
                    <span className="text-muted-foreground capitalize">{c}</span>
                    <span className="font-medium">{mock.antes[c]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Depois</p>
              <div className="space-y-2">
                {campos.map((c) => (
                  <div key={c} className={`flex justify-between text-sm ${mock.camposAlterados.includes(c) ? "bg-warning/10 -mx-2 px-2 py-1 rounded font-semibold" : ""}`}>
                    <span className="text-muted-foreground capitalize">{c}</span>
                    <span className={mock.camposAlterados.includes(c) ? "text-destructive font-bold" : "font-medium"}>{mock.depois[c]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ações */}
      <Card>
        <CardHeader><CardTitle className="text-base">Ações Propostas ({mockAcoes.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground">
              <th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Aplicação</th>
              <th className="p-4 font-medium">Perfil/Grupo</th><th className="p-4 font-medium">Regra Origem</th>
              <th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Tentativas</th>
            </tr></thead>
            <tbody>
              {mockAcoes.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-4"><Badge variant="outline" className={tipoAcaoColors[a.tipo]}>{tipoAcaoLabels[a.tipo]}</Badge></td>
                  <td className="p-4 font-medium">{a.app}</td>
                  <td className="p-4 text-muted-foreground">{a.perfil}</td>
                  <td className="p-4 text-xs text-primary hover:underline cursor-pointer">{a.regra}</td>
                  <td className="p-4"><Badge variant="outline" className={acaoStatusColors[a.status]}>{a.status}</Badge></td>
                  <td className="p-4 text-muted-foreground">{a.tentativas}/3</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Timeline Aprovação */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cadeia de Aprovação</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {mockAprovacoes.map((ap, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-8 bg-border" />}
                <div className="flex flex-col items-center gap-1">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${aprovacaoStatusColors[ap.status]}`}>
                    {ap.status === "aprovado" ? <Check className="h-4 w-4" /> : ap.ordem}
                  </div>
                  <span className="text-xs font-medium">{ap.aprovador}</span>
                  <span className="text-[10px] text-muted-foreground">{ap.perfil}</span>
                  {ap.data && <span className="text-[10px] text-muted-foreground">{ap.data}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
