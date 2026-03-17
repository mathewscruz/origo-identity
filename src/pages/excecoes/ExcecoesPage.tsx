import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  aprovada: "bg-success/15 text-success border-success/30",
  rejeitada: "bg-destructive/15 text-destructive border-destructive/30",
  expirada: "bg-muted text-muted-foreground",
  revogada: "bg-muted text-muted-foreground",
};
const tipoColors: Record<string, string> = {
  concessao_extra: "bg-info/15 text-info border-info/30",
  remocao: "bg-destructive/15 text-destructive border-destructive/30",
  elevacao_temporaria: "bg-warning/15 text-warning border-warning/30",
};

const mockExcecoes = [
  { id: "1", pessoa: "Pedro Costa", app: "AWS Console", tipo: "concessao_extra", justificativa: "Necessidade de acesso ao ambiente de staging para deploy emergencial", solicitadoPor: "Maria Owner", status: "pendente", validade: "30/06/2026", aprovacoes: "1/2" },
  { id: "2", pessoa: "Diego Santos", app: "GitHub Enterprise", tipo: "elevacao_temporaria", justificativa: "Projeto temporário de migração de repositórios", solicitadoPor: "João IAM", status: "aprovada", validade: "30/04/2026", aprovacoes: "2/2" },
  { id: "3", pessoa: "Lucia Ferreira", app: "Datadog", tipo: "concessao_extra", justificativa: "Análise de performance requer acesso a métricas avançadas", solicitadoPor: "João IAM", status: "rejeitada", validade: "—", aprovacoes: "0/1" },
  { id: "4", pessoa: "Ana Silva", app: "SAP ERP", tipo: "concessao_extra", justificativa: "Suporte pontual a processo de fechamento contábil", solicitadoPor: "Maria Owner", status: "expirada", validade: "28/02/2026", aprovacoes: "2/2" },
];

type TabKey = "pendentes" | "aprovadas" | "rejeitadas" | "expiradas" | "todas";
const tabFilter: Record<TabKey, (e: typeof mockExcecoes[0]) => boolean> = {
  pendentes: (e) => e.status === "pendente",
  aprovadas: (e) => e.status === "aprovada",
  rejeitadas: (e) => e.status === "rejeitada",
  expiradas: (e) => ["expirada", "revogada"].includes(e.status),
  todas: () => true,
};

export default function ExcecoesPage() {
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filtered = mockExcecoes.filter(tabFilter[tab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exceções de Acesso</h1>
          <p className="text-sm text-muted-foreground">Concessões fora da regra com justificativa e aprovação</p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}><Plus className="mr-1 h-4 w-4" />Nova Exceção</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({mockExcecoes.filter(tabFilter.pendentes).length})</TabsTrigger>
          <TabsTrigger value="aprovadas">Aprovadas ({mockExcecoes.filter(tabFilter.aprovadas).length})</TabsTrigger>
          <TabsTrigger value="rejeitadas">Rejeitadas ({mockExcecoes.filter(tabFilter.rejeitadas).length})</TabsTrigger>
          <TabsTrigger value="expiradas">Expiradas ({mockExcecoes.filter(tabFilter.expiradas).length})</TabsTrigger>
          <TabsTrigger value="todas">Todas ({mockExcecoes.length})</TabsTrigger>
        </TabsList>
        {["pendentes", "aprovadas", "rejeitadas", "expiradas", "todas"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card><CardContent className="p-0">
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Pessoa</th><th className="p-4 font-medium">Aplicação</th>
                <th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Justificativa</th>
                <th className="p-4 font-medium">Solicitado por</th><th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Validade</th><th className="p-4 font-medium">Aprovações</th>
                {tab === "pendentes" && <th className="p-4 font-medium">Ações</th>}
              </tr></thead><tbody>
                {filtered.map((ex) => (
                  <tr key={ex.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-4 font-medium text-primary">{ex.pessoa}</td>
                    <td className="p-4 text-muted-foreground">{ex.app}</td>
                    <td className="p-4"><Badge variant="outline" className={tipoColors[ex.tipo]}>{ex.tipo.replace(/_/g, " ")}</Badge></td>
                    <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate">{ex.justificativa}</td>
                    <td className="p-4 text-muted-foreground">{ex.solicitadoPor}</td>
                    <td className="p-4"><Badge variant="outline" className={statusColors[ex.status]}>{ex.status}</Badge></td>
                    <td className="p-4 text-muted-foreground text-xs">{ex.validade}</td>
                    <td className="p-4 text-muted-foreground">{ex.aprovacoes}</td>
                    {tab === "pendentes" && (
                      <td className="p-4"><div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-success"><Check className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><X className="h-3 w-3" /></Button>
                      </div></td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhuma exceção.</td></tr>}
              </tbody></table>
            </CardContent></Card>
          </TabsContent>
        ))}
      </Tabs>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader><SheetTitle>Nova Exceção</SheetTitle><SheetDescription>Solicitar acesso fora da regra padrão</SheetDescription></SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2"><Label>Pessoa</Label><Input placeholder="Buscar pessoa..." /></div>
            <div className="space-y-2"><Label>Aplicação</Label><Select><SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>
              <SelectItem value="m365">Microsoft 365</SelectItem><SelectItem value="sap">SAP ERP</SelectItem>
              <SelectItem value="jira">Jira</SelectItem><SelectItem value="aws">AWS Console</SelectItem>
            </SelectContent></Select></div>
            <div className="space-y-2"><Label>Perfil</Label><Select><SelectTrigger><SelectValue placeholder="Selecionar perfil" /></SelectTrigger><SelectContent>
              <SelectItem value="p1">Acesso Básico Office 365</SelectItem><SelectItem value="p2">Desenvolvedor Full-Stack</SelectItem>
              <SelectItem value="p3">Admin Infraestrutura</SelectItem>
            </SelectContent></Select></div>
            <div className="space-y-2"><Label>Tipo</Label><Select><SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent>
              <SelectItem value="concessao_extra">Concessão extra</SelectItem><SelectItem value="remocao">Remoção</SelectItem>
              <SelectItem value="elevacao_temporaria">Elevação temporária</SelectItem>
            </SelectContent></Select></div>
            <div className="space-y-2"><Label>Justificativa *</Label><Textarea placeholder="Descreva o motivo desta exceção..." rows={4} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Data início</Label><Input type="date" /></div>
              <div className="space-y-2"><Label>Data fim</Label><Input type="date" /></div>
            </div>
          </div>
          <SheetFooter><Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancelar</Button><Button onClick={() => setDrawerOpen(false)}>Solicitar Exceção</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
