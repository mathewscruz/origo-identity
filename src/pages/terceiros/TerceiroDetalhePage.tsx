import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, RefreshCw, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const mockTerceiro = {
  id: "10", nome: "Ricardo Mendes", email: "ricardo@techconsult.com", cpf: "987.654.321-00",
  cargo: "Consultor SAP", area: "Tecnologia", empresa: "Órigo Matriz",
  empresaContratada: "TechConsult Ltda", gestor: "Roberto Almeida",
  criticidade: "alta", statusContrato: "ativo",
  inicioContrato: "2025-09-01", fimContrato: "2026-03-24",
  renovacaoObrigatoria: true, observacoes: "Projeto de migração SAP S/4HANA",
};

const mockAcessos = [
  { app: "SAP ERP", perfil: "Consultor SAP", origem: "regra", aprovadoPor: "Roberto Almeida → Maria Owner", status: "ativo" },
  { app: "Microsoft 365", perfil: "Acesso Básico Office 365", origem: "regra", aprovadoPor: "Roberto Almeida", status: "ativo" },
  { app: "Jira", perfil: "Desenvolvedor Full-Stack", origem: "excecao", aprovadoPor: "Roberto Almeida → João IAM", status: "ativo" },
];

const mockHistoricoJML = [
  { data: "01/09/2025", tipo: "joiner", descricao: "Admissão como terceiro — Consultor SAP", status: "executado" },
  { data: "15/12/2025", tipo: "mover", descricao: "Criticidade alterada: Média → Alta", status: "executado" },
];

function contractProgress(inicio: string, fim: string): number {
  const start = new Date(inicio).getTime();
  const end = new Date(fim).getTime();
  const now = new Date("2026-03-17").getTime();
  const total = end - start;
  const elapsed = now - start;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

function diasRestantes(dataFim: string): number {
  return Math.ceil((new Date(dataFim).getTime() - new Date("2026-03-17").getTime()) / (1000 * 60 * 60 * 24));
}

const tipoJMLColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
};

export default function TerceiroDetalhePage() {
  const { id } = useParams();
  const [renovarOpen, setRenovarOpen] = useState(false);
  const progress = contractProgress(mockTerceiro.inicioContrato, mockTerceiro.fimContrato);
  const dias = diasRestantes(mockTerceiro.fimContrato);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/terceiros"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{mockTerceiro.nome}</h1>
            <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">Criticidade Alta</Badge>
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">Contrato Ativo</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {mockTerceiro.cargo} · {mockTerceiro.empresaContratada} · Gestor: {mockTerceiro.gestor}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Pencil className="mr-1 h-3 w-3" /> Editar
          </Button>
          <Button size="sm" onClick={() => setRenovarOpen(true)}>
            <RefreshCw className="mr-1 h-3 w-3" /> Renovar Contrato
          </Button>
        </div>
      </div>

      {/* Barra de progresso do contrato */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Início: {new Date(mockTerceiro.inicioContrato).toLocaleDateString("pt-BR")}
            </span>
            <span className={`text-xs font-medium ${dias <= 7 ? "text-destructive" : dias <= 30 ? "text-warning" : "text-muted-foreground"}`}>
              {dias > 0 ? `${dias} dias restantes` : `Vencido há ${Math.abs(dias)} dias`}
            </span>
            <span className="text-xs text-muted-foreground">
              Fim: {new Date(mockTerceiro.fimContrato).toLocaleDateString("pt-BR")}
            </span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="mt-2 flex items-center justify-between">
            <div className="h-1.5 w-1.5 rounded-full bg-success" />
            <div className="relative flex-1 mx-1">
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-primary bg-card"
                style={{ left: `${progress}%` }}
              />
            </div>
            <div className={`h-1.5 w-1.5 rounded-full ${dias <= 0 ? "bg-destructive" : "bg-muted-foreground/30"}`} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="contrato">
        <TabsList>
          <TabsTrigger value="contrato">Dados Contrato</TabsTrigger>
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="acessos">Acessos ({mockAcessos.length})</TabsTrigger>
          <TabsTrigger value="jml">Histórico JML</TabsTrigger>
        </TabsList>

        <TabsContent value="contrato" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Empresa contratada", mockTerceiro.empresaContratada],
                  ["Gestor responsável", mockTerceiro.gestor],
                  ["Início contrato", new Date(mockTerceiro.inicioContrato).toLocaleDateString("pt-BR")],
                  ["Fim contrato", new Date(mockTerceiro.fimContrato).toLocaleDateString("pt-BR")],
                  ["Criticidade", mockTerceiro.criticidade.charAt(0).toUpperCase() + mockTerceiro.criticidade.slice(1)],
                  ["Renovação obrigatória", mockTerceiro.renovacaoObrigatoria ? "Sim" : "Não"],
                  ["Status contrato", mockTerceiro.statusContrato.charAt(0).toUpperCase() + mockTerceiro.statusContrato.slice(1)],
                  ["Observações", mockTerceiro.observacoes],
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

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Nome", mockTerceiro.nome],
                  ["Email", mockTerceiro.email],
                  ["CPF", mockTerceiro.cpf],
                  ["Cargo", mockTerceiro.cargo],
                  ["Área", mockTerceiro.area],
                  ["Empresa (alocação)", mockTerceiro.empresa],
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
                    <th className="p-4 font-medium">Aprovado por</th>
                    <th className="p-4 font-medium">Status</th>
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
                      <td className="p-4 text-xs text-muted-foreground">{a.aprovadoPor}</td>
                      <td className="p-4"><Badge className="bg-success text-success-foreground">Ativo</Badge></td>
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
                          <Badge className={`${tipoJMLColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo}</Badge>
                          <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px]">{ev.status}</Badge>
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
      </Tabs>

      {/* Modal Renovar Contrato */}
      <Dialog open={renovarOpen} onOpenChange={setRenovarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar Contrato</DialogTitle>
            <DialogDescription>
              Renovar contrato de {mockTerceiro.nome} ({mockTerceiro.empresaContratada})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nova data de fim</Label>
              <Input type="date" />
            </div>
            <div className="space-y-2">
              <Label>Justificativa</Label>
              <Textarea placeholder="Motivo da renovação..." rows={3} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Manter acessos atuais</Label>
                <p className="text-xs text-muted-foreground">Os {mockAcessos.length} acessos ativos serão mantidos</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenovarOpen(false)}>Cancelar</Button>
            <Button onClick={() => setRenovarOpen(false)}>Confirmar Renovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
