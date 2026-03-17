import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Plus, Trash2, Play, AlertTriangle } from "lucide-react";

interface Condicao {
  id: string;
  campo: string;
  operador: string;
  valor: string;
}

interface Resultado {
  id: string;
  tipo: string;
  perfil?: string;
  aprovador?: string;
  mensagem?: string;
}

const campoOptions = [
  { value: "cargo", label: "Cargo" },
  { value: "area", label: "Área" },
  { value: "tipo_vinculo", label: "Tipo Vínculo" },
  { value: "empresa", label: "Empresa" },
  { value: "localidade", label: "Localidade" },
  { value: "status", label: "Status" },
];

const operadorOptions = [
  { value: "igual", label: "Igual a" },
  { value: "diferente", label: "Diferente de" },
  { value: "em_lista", label: "Em lista" },
  { value: "nao_em_lista", label: "Não em lista" },
];

const tipoResultadoOptions = [
  { value: "conceder_perfil", label: "Conceder perfil" },
  { value: "revogar_perfil", label: "Revogar perfil" },
  { value: "atribuir_licenca", label: "Atribuir licença" },
  { value: "exigir_aprovacao", label: "Exigir aprovação" },
  { value: "gerar_alerta", label: "Gerar alerta" },
  { value: "bloquear_concessao", label: "Bloquear concessão" },
];

const perfilOptions = [
  "Acesso Básico Office 365",
  "Desenvolvedor Full-Stack",
  "Admin Infraestrutura",
  "Analista Financeiro",
  "Leitura BI",
];

const mockSimulacao = [
  { pessoa: "Carlos Souza", cargo: "Dev Senior", acao: "Conceder", perfil: "Desenvolvedor Full-Stack" },
  { pessoa: "Ana Santos", cargo: "Dev Pleno", acao: "Conceder", perfil: "Desenvolvedor Full-Stack" },
  { pessoa: "Pedro Lima", cargo: "Dev Junior", acao: "Conceder", perfil: "Desenvolvedor Full-Stack" },
  { pessoa: "Maria Ferreira", cargo: "Tech Lead", acao: "Conceder", perfil: "Desenvolvedor Full-Stack" },
];

export default function RegraEditorPage() {
  const { id } = useParams();
  const isNew = !id;

  const [condicoes, setCondicoes] = useState<Condicao[]>(
    isNew ? [{ id: "1", campo: "", operador: "", valor: "" }] : [
      { id: "1", campo: "cargo", operador: "em_lista", valor: "Dev Junior, Dev Pleno, Dev Senior" },
      { id: "2", campo: "area", operador: "igual", valor: "Tecnologia" },
    ]
  );

  const [resultados, setResultados] = useState<Resultado[]>(
    isNew ? [{ id: "1", tipo: "" }] : [
      { id: "1", tipo: "conceder_perfil", perfil: "Desenvolvedor Full-Stack" },
    ]
  );

  const [showSimulacao, setShowSimulacao] = useState(false);

  const addCondicao = () => {
    setCondicoes([...condicoes, { id: String(Date.now()), campo: "", operador: "", valor: "" }]);
  };

  const removeCondicao = (cid: string) => {
    if (condicoes.length > 1) setCondicoes(condicoes.filter((c) => c.id !== cid));
  };

  const addResultado = () => {
    setResultados([...resultados, { id: String(Date.now()), tipo: "" }]);
  };

  const removeResultado = (rid: string) => {
    if (resultados.length > 1) setResultados(resultados.filter((r) => r.id !== rid));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/regras">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isNew ? "Nova Regra" : "Editar Regra"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isNew ? "Configure condições e resultados da regra" : `Editando regra #${id}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/regras">Cancelar</Link>
          </Button>
          <Button variant="outline">Salvar Rascunho</Button>
          <Button>Ativar Regra</Button>
        </div>
      </div>

      {/* Seção 1: Dados Gerais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da regra</Label>
              <Input defaultValue={isNew ? "" : "CLT Tecnologia → Dev Full-Stack"} placeholder="Nome descritivo da regra" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Input type="number" defaultValue={isNew ? "" : "10"} placeholder="1-100" />
              </div>
              <div className="space-y-2">
                <Label>Modo de execução</Label>
                <Select defaultValue={isNew ? undefined : "automatico"}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatico">Automático</SelectItem>
                    <SelectItem value="aprovacao_manual">Aprovação Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              defaultValue={isNew ? "" : "Concede perfil de desenvolvedor para todos os cargos de dev na área de Tecnologia"}
              placeholder="Descreva o objetivo desta regra"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início vigência</Label>
              <Input type="date" defaultValue={isNew ? "" : "2026-01-01"} />
            </div>
            <div className="space-y-2">
              <Label>Fim vigência (opcional)</Label>
              <Input type="date" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seção 2: Condições */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Condições</CardTitle>
            <CardDescription>Todas as condições são combinadas com AND</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addCondicao}>
            <Plus className="mr-1 h-3 w-3" />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {condicoes.map((cond, i) => (
            <div key={cond.id} className="flex items-center gap-3">
              {i > 0 && (
                <Badge variant="outline" className="shrink-0 bg-muted">AND</Badge>
              )}
              {i === 0 && <div className="w-[52px] shrink-0" />}
              <Select defaultValue={cond.campo}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Campo" />
                </SelectTrigger>
                <SelectContent>
                  {campoOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select defaultValue={cond.operador}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Operador" />
                </SelectTrigger>
                <SelectContent>
                  {operadorOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                defaultValue={cond.valor}
                placeholder="Valor"
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeCondicao(cond.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Seção 3: Resultados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Resultados</CardTitle>
            <CardDescription>Ações executadas quando as condições são atendidas</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addResultado}>
            <Plus className="mr-1 h-3 w-3" />
            Adicionar
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {resultados.map((res) => (
            <div key={res.id} className="flex items-center gap-3">
              <Select defaultValue={res.tipo}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tipo de resultado" />
                </SelectTrigger>
                <SelectContent>
                  {tipoResultadoOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(res.tipo === "conceder_perfil" || res.tipo === "revogar_perfil") && (
                <Select defaultValue={res.perfil}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecionar perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {perfilOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {res.tipo === "exigir_aprovacao" && (
                <Select defaultValue={res.aprovador}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Tipo de aprovador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="owner_app">Owner da App</SelectItem>
                    <SelectItem value="admin_iam">Admin IAM</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {(res.tipo === "gerar_alerta" || res.tipo === "bloquear_concessao") && (
                <Input
                  defaultValue={res.mensagem}
                  placeholder={res.tipo === "gerar_alerta" ? "Mensagem do alerta" : "Motivo do bloqueio"}
                  className="flex-1"
                />
              )}
              {!res.tipo && <div className="flex-1" />}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeResultado(res.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Seção 4: Conflitos */}
      {!isNew && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Conflitos Detectados
              <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">1</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="text-sm">
                <p className="font-medium">Conflito com "Tech Lead → Dev + Infra"</p>
                <p className="text-muted-foreground">
                  Tipo: Prioridade resolve — a regra com maior prioridade prevalece. Ambas concedem perfis para a mesma população.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seção 5: Simulação */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Simulação de Impacto</CardTitle>
            <CardDescription>Preview das ações que seriam executadas se a regra fosse ativada agora</CardDescription>
          </div>
          <Button variant="outline" onClick={() => setShowSimulacao(true)}>
            <Play className="mr-1 h-3 w-3" />
            Simular
          </Button>
        </CardHeader>
        {showSimulacao && (
          <CardContent>
            <div className="mb-4 flex gap-4">
              <Card className="flex-1">
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold">{mockSimulacao.length}</p>
                  <p className="text-xs text-muted-foreground">Pessoas impactadas</p>
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-success">{mockSimulacao.length}</p>
                  <p className="text-xs text-muted-foreground">Concessões</p>
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-xs text-muted-foreground">Conflitos</p>
                </CardContent>
              </Card>
              <Card className="flex-1">
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold">{mockSimulacao.length}</p>
                  <p className="text-xs text-muted-foreground">Licenças consumidas</p>
                </CardContent>
              </Card>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Pessoa</th>
                  <th className="pb-2 font-medium">Cargo</th>
                  <th className="pb-2 font-medium">Ação</th>
                  <th className="pb-2 font-medium">Perfil</th>
                </tr>
              </thead>
              <tbody>
                {mockSimulacao.map((item, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{item.pessoa}</td>
                    <td className="py-2 text-muted-foreground">{item.cargo}</td>
                    <td className="py-2">
                      <Badge className="bg-success text-success-foreground">{item.acao}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">{item.perfil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
