import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const statusContratoConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  vencido: { label: "Vencido", class: "bg-destructive/15 text-destructive border-destructive/30" },
  renovado: { label: "Renovado", class: "bg-info/15 text-info border-info/30" },
  encerrado: { label: "Encerrado", class: "bg-muted text-muted-foreground" },
};

const criticidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-info/15 text-info border-info/30" },
  alta: { label: "Alta", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Crítica", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const mockTerceiros = [
  { id: "10", nome: "Ricardo Mendes", empresaContratada: "TechConsult Ltda", gestor: "Roberto Almeida", cargo: "Consultor SAP", criticidade: "alta", fimContrato: "2026-03-24", statusContrato: "ativo", acessos: 3 },
  { id: "11", nome: "Juliana Rocha", empresaContratada: "TechConsult Ltda", gestor: "Roberto Almeida", cargo: "Dev Frontend", criticidade: "media", fimContrato: "2026-06-30", statusContrato: "ativo", acessos: 4 },
  { id: "12", nome: "Marcos Vieira", empresaContratada: "SecureIT S.A.", gestor: "João IAM", cargo: "Analista Segurança", criticidade: "critica", fimContrato: "2026-03-20", statusContrato: "ativo", acessos: 6 },
  { id: "13", nome: "Camila Duarte", empresaContratada: "TechConsult Ltda", gestor: "Maria Owner", cargo: "Designer UX", criticidade: "baixa", fimContrato: "2026-09-15", statusContrato: "ativo", acessos: 2 },
  { id: "14", nome: "Thiago Nunes", empresaContratada: "SecureIT S.A.", gestor: "João IAM", cargo: "DBA", criticidade: "critica", fimContrato: "2026-02-28", statusContrato: "vencido", acessos: 5 },
];

function diasRestantes(dataFim: string): number {
  const fim = new Date(dataFim);
  const hoje = new Date("2026-03-17");
  return Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function fimContratoDisplay(dataFim: string) {
  const dias = diasRestantes(dataFim);
  const formatted = new Date(dataFim).toLocaleDateString("pt-BR");
  if (dias < 0) return <span className="font-medium text-destructive">{formatted} (vencido)</span>;
  if (dias <= 7) return <span className="font-medium text-destructive">{formatted} ({dias}d)</span>;
  if (dias <= 30) return <span className="font-medium text-warning">{formatted} ({dias}d)</span>;
  return <span className="text-muted-foreground">{formatted}</span>;
}

export default function TerceirosPage() {
  const [busca, setBusca] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const vencendo7d = mockTerceiros.filter((t) => {
    const d = diasRestantes(t.fimContrato);
    return d >= 0 && d <= 7;
  }).length;

  const filtered = mockTerceiros.filter((t) => {
    if (busca && !t.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Terceiros</h1>
          <p className="text-sm text-muted-foreground">Ciclo de vida de terceiros com controle de contrato</p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Novo Terceiro
        </Button>
      </div>

      {vencendo7d > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {vencendo7d} terceiro(s) com contrato vencendo em 7 dias
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar terceiros..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Nome</th>
                  <th className="p-4 font-medium">Empresa Contratada</th>
                  <th className="p-4 font-medium">Gestor</th>
                  <th className="p-4 font-medium">Cargo</th>
                  <th className="p-4 font-medium">Criticidade</th>
                  <th className="p-4 font-medium">Fim Contrato</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Acessos</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-4">
                      <Link to={`/terceiros/${t.id}`} className="font-medium text-primary hover:underline">{t.nome}</Link>
                    </td>
                    <td className="p-4 text-muted-foreground">{t.empresaContratada}</td>
                    <td className="p-4 text-muted-foreground">{t.gestor}</td>
                    <td className="p-4 text-muted-foreground">{t.cargo}</td>
                    <td className="p-4">
                      <Badge variant="outline" className={criticidadeConfig[t.criticidade].class}>
                        {criticidadeConfig[t.criticidade].label}
                      </Badge>
                    </td>
                    <td className="p-4">{fimContratoDisplay(t.fimContrato)}</td>
                    <td className="p-4">
                      <Badge variant="outline" className={statusContratoConfig[t.statusContrato].class}>
                        {statusContratoConfig[t.statusContrato].label}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted-foreground">{t.acessos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Drawer Novo Terceiro */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Novo Terceiro</SheetTitle>
            <SheetDescription>Cadastrar novo profissional terceirizado</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input placeholder="Nome do terceiro" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="email@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <Input placeholder="000.000.000-00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultor">Consultor SAP</SelectItem>
                    <SelectItem value="dev">Dev Frontend</SelectItem>
                    <SelectItem value="analista">Analista Segurança</SelectItem>
                    <SelectItem value="dba">DBA</SelectItem>
                    <SelectItem value="designer">Designer UX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Área</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tec">Tecnologia</SelectItem>
                    <SelectItem value="fin">Financeiro</SelectItem>
                    <SelectItem value="rh">Recursos Humanos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Empresa contratada</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tech">TechConsult Ltda</SelectItem>
                  <SelectItem value="secure">SecureIT S.A.</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gestor responsável</Label>
              <Input placeholder="Buscar gestor..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início contrato</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>Fim contrato</Label>
                <Input type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Criticidade</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Renovação obrigatória</Label>
                <p className="text-xs text-muted-foreground">Exigir renovação formal antes do vencimento</p>
              </div>
              <Switch />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Observações sobre o terceiro..." rows={3} />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
            <Button onClick={() => setDrawerOpen(false)}>Cadastrar Terceiro</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
