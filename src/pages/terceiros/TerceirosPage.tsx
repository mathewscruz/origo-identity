import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Plus, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTerceiros } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";

const criticidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-info/15 text-info border-info/30" },
  alta: { label: "Alta", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Crítica", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

function diasRestantes(dataFim: string | null): number {
  if (!dataFim) return 999;
  return Math.ceil((new Date(dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function fimContratoDisplay(dataFim: string | null) {
  if (!dataFim) return <span className="text-muted-foreground">—</span>;
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data: terceiros, isLoading } = useTerceiros();

  const list = terceiros ?? [];
  const vencendo7d = list.filter((t: any) => { const d = diasRestantes(t.contrato_fim); return d >= 0 && d <= 7; }).length;
  const filtered = list.filter((t: any) => !busca || t.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Terceiros</h1>
          <p className="text-sm text-muted-foreground">Ciclo de vida de terceiros com controle de contrato</p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-1 h-4 w-4" />Novo Terceiro</Button>
      </div>

      {vencendo7d > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">{vencendo7d} terceiro(s) com contrato vencendo em 7 dias</span>
          </CardContent>
        </Card>
      )}

      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Buscar terceiros..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Nome</th>
                    <th className="p-4 font-medium">Empresa</th>
                    <th className="p-4 font-medium">Responsável</th>
                    <th className="p-4 font-medium">Criticidade</th>
                    <th className="p-4 font-medium">Fim Contrato</th>
                    <th className="p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((t: any) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4"><Link to={`/terceiros/${t.id}`} className="font-medium text-primary hover:underline">{t.nome}</Link></td>
                      <td className="p-4 text-muted-foreground">{t.empresa_terceira || "—"}</td>
                      <td className="p-4 text-muted-foreground">{t.responsavel || "—"}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={criticidadeConfig[t.criticidade]?.class || ""}>
                          {criticidadeConfig[t.criticidade]?.label || t.criticidade}
                        </Badge>
                      </td>
                      <td className="p-4">{fimContratoDisplay(t.contrato_fim)}</td>
                      <td className="p-4">
                        <Badge variant={t.ativo ? "default" : "secondary"}>{t.ativo ? "Ativo" : "Inativo"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Novo Terceiro</SheetTitle>
            <SheetDescription>Cadastrar novo profissional terceirizado</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2"><Label>Nome completo</Label><Input placeholder="Nome do terceiro" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="email@empresa.com" /></div>
              <div className="space-y-2"><Label>Empresa</Label><Input placeholder="Empresa contratada" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Início contrato</Label><Input type="date" /></div>
              <div className="space-y-2"><Label>Fim contrato</Label><Input type="date" /></div>
            </div>
            <div className="space-y-2">
              <Label>Criticidade</Label>
              <Select><SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem><SelectItem value="critica">Crítica</SelectItem>
              </SelectContent></Select>
            </div>
            <div className="space-y-2"><Label>Observações</Label><Textarea placeholder="Observações..." rows={3} /></div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
            <Button onClick={() => setDrawerOpen(false)}>Cadastrar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
