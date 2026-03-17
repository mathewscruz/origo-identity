import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useExcecoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data: excecoes, isLoading } = useExcecoes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ colaborador_nome: "", perfil_solicitado: "", justificativa: "", solicitante: "", validade: "" });
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (excecoes ?? []) as any[];
  const filtered = list.filter(tabFilter[tab]);
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  const handleCreate = async () => {
    if (!form.justificativa.trim() || !form.solicitante.trim()) { toast({ title: "Campos obrigatórios", variant: "destructive" }); return; }
    const { error } = await supabase.from("excecoes").insert({
      colaborador_nome: form.colaborador_nome || null,
      perfil_solicitado: form.perfil_solicitado || null,
      justificativa: form.justificativa.trim(),
      solicitante: form.solicitante.trim(),
      validade: form.validade || null,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Exceção solicitada" });
    qc.invalidateQueries({ queryKey: ["excecoes"] });
    setDialogOpen(false);
  };

  const handleDecision = async (id: string, status: "aprovada" | "rejeitada") => {
    const { error } = await supabase.from("excecoes").update({ status, data_decisao: new Date().toISOString() } as any).eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: status === "aprovada" ? "Exceção aprovada" : "Exceção rejeitada" });
    qc.invalidateQueries({ queryKey: ["excecoes"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Exceções de Acesso</h1><p className="text-sm text-muted-foreground">Concessões fora da regra com justificativa e aprovação</p></div>
        <Button onClick={() => { setForm({ colaborador_nome: "", perfil_solicitado: "", justificativa: "", solicitante: "", validade: "" }); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />Nova Exceção</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setPage(1); }}>
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
              {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
                <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Solicitante</th><th className="p-4 font-medium">Colaborador</th>
                  <th className="p-4 font-medium">Perfil</th><th className="p-4 font-medium">Justificativa</th>
                  <th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Validade</th>
                  {tab === "pendentes" && <th className="p-4 font-medium">Ações</th>}
                </tr></thead><tbody>
                  {paginatedItems.map((ex: any) => (
                    <tr key={ex.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4 font-medium">{ex.solicitante}</td>
                      <td className="p-4 text-primary">{ex.colaborador_nome || "—"}</td>
                      <td className="p-4 text-muted-foreground">{ex.perfil_solicitado || ex.perfis_acesso?.nome || "—"}</td>
                      <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate">{ex.justificativa}</td>
                      <td className="p-4"><Badge variant="outline" className={statusColors[ex.status]}>{ex.status}</Badge></td>
                      <td className="p-4 text-muted-foreground text-xs">{ex.validade ? new Date(ex.validade).toLocaleDateString("pt-BR") : "—"}</td>
                      {tab === "pendentes" && (
                        <td className="p-4"><div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => handleDecision(ex.id, "aprovada")}><Check className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDecision(ex.id, "rejeitada")}><X className="h-3 w-3" /></Button>
                        </div></td>
                      )}
                    </tr>
                  ))}
                  {paginatedItems.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhuma exceção.</td></tr>}
                </tbody></table>
              )}
            </CardContent></Card>
            <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>Nova Exceção</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Solicitante *</Label><Input value={form.solicitante} onChange={(e) => setForm({ ...form, solicitante: e.target.value })} /></div>
            <div className="space-y-2"><Label>Colaborador</Label><Input value={form.colaborador_nome} onChange={(e) => setForm({ ...form, colaborador_nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Perfil solicitado</Label><Input value={form.perfil_solicitado} onChange={(e) => setForm({ ...form, perfil_solicitado: e.target.value })} /></div>
            <div className="space-y-2"><Label>Justificativa *</Label><Textarea value={form.justificativa} onChange={(e) => setForm({ ...form, justificativa: e.target.value })} rows={3} /></div>
            <div className="space-y-2"><Label>Validade</Label><Input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleCreate}>Solicitar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
