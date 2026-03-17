import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useLicencas, useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function LicencasPage() {
  const { data: licencas, isLoading } = useLicencas();
  const { data: aplicacoes } = useAplicacoes();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", aplicacao_id: "", total: "0", em_uso: "0", tipo: "SaaS", custo_unitario: "", renovacao: "" });
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (licencas ?? []) as any[];
  const criticos = list.filter((l) => l.total > 0 && Math.round((l.em_uso / l.total) * 100) >= 90).length;
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  const openNew = () => { setEditing(null); setForm({ nome: "", aplicacao_id: "", total: "0", em_uso: "0", tipo: "SaaS", custo_unitario: "", renovacao: "" }); setDialogOpen(true); };
  const openEdit = (l: any) => { setEditing(l); setForm({ nome: l.nome, aplicacao_id: l.aplicacao_id || "", total: String(l.total), em_uso: String(l.em_uso), tipo: l.tipo || "SaaS", custo_unitario: l.custo_unitario != null ? String(l.custo_unitario) : "", renovacao: l.renovacao || "" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), aplicacao_id: form.aplicacao_id || null, total: parseInt(form.total) || 0, em_uso: parseInt(form.em_uso) || 0, tipo: form.tipo, custo_unitario: form.custo_unitario ? parseFloat(form.custo_unitario) : null, renovacao: form.renovacao || null };
    if (editing) {
      const { error } = await supabase.from("licencas").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Licença atualizada" });
    } else {
      const { error } = await supabase.from("licencas").insert(payload);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Licença criada" });
    }
    qc.invalidateQueries({ queryKey: ["licencas"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("licencas").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Licença excluída" });
    qc.invalidateQueries({ queryKey: ["licencas"] });
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Licenças</h1><p className="text-sm text-muted-foreground">Inventário, atribuição e revogação de licenças</p></div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Tipo</Button>
      </div>
      {criticos > 0 && <Card className="border-destructive/30 bg-destructive/5"><CardContent className="flex items-center gap-3 py-3"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-sm font-medium text-destructive">{criticos} tipo(s) com disponibilidade crítica (&lt;10%)</span></CardContent></Card>}

      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Aplicação</th><th className="p-4 font-medium">Total</th><th className="p-4 font-medium">Em uso</th>
            <th className="p-4 font-medium min-w-[180px]">Disponibilidade</th><th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Renovação</th><th className="p-4 font-medium w-20">Ações</th>
          </tr></thead><tbody>
            {paginatedItems.map((l: any) => {
              const pct = l.total > 0 ? Math.round((l.em_uso / l.total) * 100) : 0;
              const disp = l.total - l.em_uso;
              return (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="p-4 font-medium text-primary">{l.nome}</td>
                  <td className="p-4 text-muted-foreground">{l.aplicacoes?.nome || "—"}</td>
                  <td className="p-4 text-muted-foreground">{l.total}</td>
                  <td className="p-4 text-muted-foreground">{l.em_uso}</td>
                  <td className="p-4"><div className="flex items-center gap-2"><Progress value={pct} className={`h-2 flex-1 ${pct >= 90 ? "[&>div]:bg-destructive" : pct >= 75 ? "[&>div]:bg-warning" : ""}`} /><span className={`text-xs font-medium ${pct >= 90 ? "text-destructive" : "text-muted-foreground"}`}>{disp} disp.</span></div></td>
                  <td className="p-4"><Badge variant="outline">{l.tipo || "SaaS"}</Badge></td>
                  <td className="p-4 text-muted-foreground text-xs">{l.renovacao ? new Date(l.renovacao).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="p-4"><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(l.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div></td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Editar Licença" : "Nova Licença"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Aplicação</Label>
              <Select value={form.aplicacao_id} onValueChange={(v) => setForm({ ...form, aplicacao_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar (opcional)" /></SelectTrigger>
                <SelectContent>{(aplicacoes as any[] ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Total</Label><Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></div>
              <div className="space-y-2"><Label>Em uso</Label><Input type="number" value={form.em_uso} onChange={(e) => setForm({ ...form, em_uso: e.target.value })} /></div>
              <div className="space-y-2"><Label>Custo unit.</Label><Input type="number" step="0.01" value={form.custo_unitario} onChange={(e) => setForm({ ...form, custo_unitario: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo</Label><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></div>
              <div className="space-y-2"><Label>Renovação</Label><Input type="date" value={form.renovacao} onChange={(e) => setForm({ ...form, renovacao: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir licença?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
