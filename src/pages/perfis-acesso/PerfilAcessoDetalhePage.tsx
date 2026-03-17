import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil } from "lucide-react";

const mockPerfil = {
  id: "2",
  nome: "Desenvolvedor Full-Stack",
  descricao: "Acesso a ferramentas de desenvolvimento, repositórios e ambientes de staging/produção",
  sensibilidade: "sensivel",
  tipo: "padrao",
  validade: null,
  aprovacaoExtra: true,
  justificativa: true,
};

const mockComposicao = [
  { app: "Jira", grupo: "GRP-DEV-JIRA", licenca: "Jira Software", obrigatoria: true },
  { app: "GitHub Enterprise", grupo: "GRP-DEV-GITHUB", licenca: "GitHub Enterprise", obrigatoria: true },
  { app: "AWS Console", grupo: "GRP-DEV-AWS", licenca: null, obrigatoria: false },
  { app: "Datadog", grupo: "GRP-DEV-DATADOG", licenca: "Datadog Pro", obrigatoria: false },
  { app: "Slack", grupo: "GRP-ALL-SLACK", licenca: "Slack Business+", obrigatoria: true },
];

const mockPessoas = [
  { id: "1", nome: "Carlos Souza", cargo: "Dev Senior", area: "Tecnologia", origem: "regra", status: "ativo" },
  { id: "2", nome: "Ana Santos", cargo: "Dev Pleno", area: "Tecnologia", origem: "regra", status: "ativo" },
  { id: "3", nome: "Pedro Lima", cargo: "Dev Junior", area: "Tecnologia", origem: "excecao", status: "ativo" },
  { id: "4", nome: "Maria Ferreira", cargo: "Tech Lead", area: "Tecnologia", origem: "regra", status: "ativo" },
];

const mockRegras = [
  { id: "1", nome: "Dev → Acesso Dev Full-Stack", prioridade: 10, modo: "automatico" },
  { id: "2", nome: "Tech Lead → Acesso Dev + Infra", prioridade: 5, modo: "aprovacao_manual" },
];

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
};

export default function PerfilAcessoDetalhePage() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/perfis-acesso">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{mockPerfil.nome}</h1>
            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
              Sensível
            </Badge>
            <Badge variant="outline">Padrão</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{mockPerfil.descricao}</p>
        </div>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 h-3 w-3" />
          Editar
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Sensibilidade</p>
            <p className="text-lg font-semibold text-warning">Sensível</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Aplicações</p>
            <p className="text-lg font-semibold">{mockComposicao.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pessoas atribuídas</p>
            <p className="text-lg font-semibold">{mockPessoas.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Aprovação extra</p>
            <p className="text-lg font-semibold text-warning">Obrigatória</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="composicao">
        <TabsList>
          <TabsTrigger value="composicao">Composição</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas Atribuídas ({mockPessoas.length})</TabsTrigger>
          <TabsTrigger value="regras">Regras que Concedem ({mockRegras.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="composicao" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Aplicação</th>
                    <th className="p-4 font-medium">Grupo Entra ID</th>
                    <th className="p-4 font-medium">Licença</th>
                    <th className="p-4 font-medium">Obrigatória</th>
                  </tr>
                </thead>
                <tbody>
                  {mockComposicao.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-4 font-medium">{item.app}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs">{item.grupo}</td>
                      <td className="p-4 text-muted-foreground">{item.licenca || "—"}</td>
                      <td className="p-4">
                        {item.obrigatoria ? (
                          <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">Sim</Badge>
                        ) : (
                          <span className="text-muted-foreground">Não</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pessoas" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th>
                    <th className="p-4 font-medium">Cargo</th>
                    <th className="p-4 font-medium">Área</th>
                    <th className="p-4 font-medium">Origem</th>
                    <th className="p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mockPessoas.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="p-4 font-medium text-primary">{p.nome}</td>
                      <td className="p-4 text-muted-foreground">{p.cargo}</td>
                      <td className="p-4 text-muted-foreground">{p.area}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={origemColors[p.origem]}>
                          {p.origem === "regra" ? "Regra" : p.origem === "excecao" ? "Exceção" : "Manual"}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge className="bg-success text-success-foreground">Ativo</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regras" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Regra</th>
                    <th className="p-4 font-medium">Prioridade</th>
                    <th className="p-4 font-medium">Modo</th>
                  </tr>
                </thead>
                <tbody>
                  {mockRegras.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-4">
                        <Link to={`/regras/${r.id}/editar`} className="font-medium text-primary hover:underline">
                          {r.nome}
                        </Link>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">{r.prioridade}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={
                          r.modo === "automatico"
                            ? "bg-success/15 text-success border-success/30"
                            : "bg-warning/15 text-warning border-warning/30"
                        }>
                          {r.modo === "automatico" ? "Automático" : "Aprovação Manual"}
                        </Badge>
                      </td>
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
