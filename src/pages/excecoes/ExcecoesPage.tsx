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
import { useExcecoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";

const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  aprovada: "bg-success/15 text-success border-success/30",
  rejeitada: "bg-destructive/15 text-destructive border-destructive/30",
  expirada: "bg-muted text-muted-foreground",
};

type TabKey = "pendentes" | "aprovadas" | "rejeitadas" | "expiradas" | "todas";
const tabFilter: Record<TabKey, (e: { status: string }) => boolean> = {
  pendentes: (e) => e.status === "pendente",
  aprovadas: (e) => e.status === "aprovada",
  rejeitadas: (e) => e.status === "rejeitada",
  expiradas: (e) => e.status === "expirada",
  todas: () => true,
};

export default function ExcecoesPage() {
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: excecoes, isLoading } = useExcecoes();

  const list = excecoes ?? [];
  const filtered = list.filter(tabFilter[tab]);

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
          <TabsTrigger value="pendentes">Pendentes ({list.filter(tabFilter.pendentes).length})</TabsTrigger>
          <TabsTrigger value="aprovadas">Aprovadas ({list.filter(tabFilter.aprovadas).length})</TabsTrigger>
          <TabsTrigger value="rejeitadas">Rejeitadas ({list.filter(tabFilter.rejeitadas).length})</TabsTrigger>
          <TabsTrigger value="expiradas">Expiradas ({list.filter(tabFilter.expiradas).length})</TabsTrigger>
          <TabsTrigger value="todas">Todas ({list.length})</TabsTrigger>
        </TabsList>
        {["pendentes", "aprovadas", "rejeitadas", "expiradas", "todas"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card><CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Solicitante</th><th className="p-4 font-medium">Colaborador</th>
                  <th className="p-4 font-medium">Perfil</th><th className="p-4 font-medium">Justificativa</th>
                  <th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Validade</th>
                  {tab === "pendentes" && <th className="p-4 font-medium">Ações</th>}
                </tr></thead><tbody>
                  {filtered.map((ex) => (
                    <tr key={ex.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4 font-medium">{ex.solicitante}</td>
                      <td className="p-4 text-primary">{ex.colaborador_nome || "—"}</td>
                      <td className="p-4 text-muted-foreground">{ex.perfil_solicitado || (ex.perfis_acesso as any)?.nome || "—"}</td>
                      <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate">{ex.justificativa}</td>
                      <td className="p-4"><Badge variant="outline" className={statusColors[ex.status]}>{ex.status}</Badge></td>
                      <td className="p-4 text-muted-foreground text-xs">{ex.validade ? new Date(ex.validade).toLocaleDateString("pt-BR") : "—"}</td>
                      {tab === "pendentes" && (
                        <td className="p-4"><div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-success"><Check className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><X className="h-3 w-3" /></Button>
                        </div></td>
                      )}
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma exceção.</td></tr>}
                </tbody></table>
              )}
            </CardContent></Card>
          </TabsContent>
        ))}
      </Tabs>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader><SheetTitle>Nova Exceção</SheetTitle><SheetDescription>Solicitar acesso fora da regra</SheetDescription></SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2"><Label>Pessoa</Label><Input placeholder="Buscar pessoa..." /></div>
            <div className="space-y-2"><Label>Perfil</Label><Input placeholder="Perfil solicitado" /></div>
            <div className="space-y-2"><Label>Justificativa *</Label><Textarea placeholder="Motivo desta exceção..." rows={4} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Validade</Label><Input type="date" /></div>
            </div>
          </div>
          <SheetFooter><Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancelar</Button><Button onClick={() => setDrawerOpen(false)}>Solicitar</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
