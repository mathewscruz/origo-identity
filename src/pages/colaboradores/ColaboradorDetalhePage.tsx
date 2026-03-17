import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, XCircle } from "lucide-react";

const mockPessoa = {
  id: "2", nome: "Carlos Souza", email: "carlos.souza@origo.com", cpf: "123.456.789-00",
  cargo: "Dev Senior", area: "Tecnologia", empresa: "Órigo Matriz", localidade: "Sede SP",
  gestor: "Roberto Almeida", tipo_vinculo: "CLT", status: "ativo",
  data_admissao: "15/03/2022", entra_id: "abc-def-123",
};

const mockAcessos = [
  { app: "Microsoft 365", perfil: "Acesso Básico Office 365", origem: "regra", status: "ativo", data: "15/03/2022" },
  { app: "GitHub Enterprise", perfil: "Desenvolvedor Full-Stack", origem: "regra", status: "ativo", data: "15/03/2022" },
  { app: "Jira", perfil: "Desenvolvedor Full-Stack", origem: "regra", status: "ativo", data: "15/03/2022" },
  { app: "AWS Console", perfil: "Desenvolvedor Full-Stack", origem: "excecao", status: "ativo", data: "01/06/2025" },
  { app: "Datadog", perfil: "Desenvolvedor Full-Stack", origem: "regra", status: "ativo", data: "15/03/2022" },
];

const mockHistoricoJML = [
  { data: "14/03/2026", tipo: "mover", descricao: "Cargo alterado: Dev Pleno → Dev Senior", status: "executado" },
  { data: "01/01/2025", tipo: "mover", descricao: "Área alterada: Produto → Tecnologia", status: "executado" },
  { data: "15/03/2022", tipo: "joiner", descricao: "Admissão — Dev Junior, área Produto", status: "executado" },
];

const mockHistoricoImportacao = [
  { importacao: "14/03/2026", campo: "cargo", antes: "Dev Pleno", depois: "Dev Senior", tipo: "cargo" },
  { importacao: "01/01/2025", campo: "area", antes: "Produto", depois: "Tecnologia", tipo: "area" },
  { importacao: "01/01/2025", campo: "cargo", antes: "Dev Junior", depois: "Dev Pleno", tipo: "cargo" },
  { importacao: "15/03/2022", campo: "—", antes: "—", depois: "Registro criado", tipo: "admissao" },
];

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
};

const tipoJMLColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};

const tipoCampoColors: Record<string, string> = {
  cargo: "bg-info/15 text-info border-info/30",
  area: "bg-warning/15 text-warning border-warning/30",
  admissao: "bg-success/15 text-success border-success/30",
  desligamento: "bg-destructive/15 text-destructive border-destructive/30",
  dados_pessoais: "bg-muted text-muted-foreground",
};

export default function ColaboradorDetalhePage() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/colaboradores"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{mockPessoa.nome}</h1>
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">Ativo</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{mockPessoa.cargo} · {mockPessoa.area} · {mockPessoa.empresa}</p>
        </div>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 h-3 w-3" /> Editar
        </Button>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="acessos">Acessos Ativos ({mockAcessos.length})</TabsTrigger>
          <TabsTrigger value="jml">Histórico JML ({mockHistoricoJML.length})</TabsTrigger>
          <TabsTrigger value="importacao">Histórico Importação ({mockHistoricoImportacao.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Nome completo", mockPessoa.nome],
                  ["Email", mockPessoa.email],
                  ["CPF", mockPessoa.cpf],
                  ["Cargo", mockPessoa.cargo],
                  ["Área", mockPessoa.area],
                  ["Empresa", mockPessoa.empresa],
                  ["Localidade", mockPessoa.localidade],
                  ["Gestor", mockPessoa.gestor],
                  ["Tipo vínculo", mockPessoa.tipo_vinculo],
                  ["Data admissão", mockPessoa.data_admissao],
                  ["Entra ID Object", mockPessoa.entra_id],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acessos" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Aplicação</th>
                    <th className="p-4 font-medium">Perfil</th>
                    <th className="p-4 font-medium">Origem</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium">Desde</th>
                    <th className="p-4 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {mockAcessos.map((a, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-4 font-medium">{a.app}</td>
                      <td className="p-4 text-muted-foreground">{a.perfil}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={origemColors[a.origem]}>
                          {a.origem === "regra" ? "Regra" : "Exceção"}
                        </Badge>
                      </td>
                      <td className="p-4"><Badge className="bg-success text-success-foreground">Ativo</Badge></td>
                      <td className="p-4 text-muted-foreground">{a.data}</td>
                      <td className="p-4">
                        <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive">
                          <XCircle className="mr-1 h-3 w-3" /> Revogar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jml" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="relative border-l-2 border-border pl-6 space-y-6">
                {mockHistoricoJML.map((ev, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-card">
                      <div className={`h-2.5 w-2.5 rounded-full ${
                        ev.tipo === "joiner" ? "bg-success" : ev.tipo === "mover" ? "bg-info" : "bg-destructive"
                      }`} />
                    </div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${tipoJMLColors[ev.tipo]} text-[10px] uppercase`}>
                            {ev.tipo}
                          </Badge>
                          <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">
                            {ev.status}
                          </Badge>
                        </div>
                        <p className="text-sm">{ev.descricao}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-4">{ev.data}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="importacao" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Importação</th>
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium">Campo</th>
                    <th className="p-4 font-medium">Antes</th>
                    <th className="p-4 font-medium">Depois</th>
                  </tr>
                </thead>
                <tbody>
                  {mockHistoricoImportacao.map((h, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-4 text-muted-foreground">{h.importacao}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={tipoCampoColors[h.tipo]}>{h.tipo}</Badge>
                      </td>
                      <td className="p-4 font-medium">{h.campo}</td>
                      <td className="p-4 text-muted-foreground">{h.antes}</td>
                      <td className="p-4 font-medium">{h.depois}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
