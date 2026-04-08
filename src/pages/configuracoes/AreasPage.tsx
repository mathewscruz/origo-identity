import { useState } from "react";
import { useCanEdit } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { useAreas, useEmpresas } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import EmptyState from "@/components/EmptyState";

export default function AreasPage() {
  const canEdit = useCanEdit();
  const { data: areas, isLoading } = useAreas();
  const { data: empresas } = useEmpresas();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", empresa_id: "", ativo: true });
  const [busca, setBusca] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = ((areas ?? []) as any[]).filter((a: any) => !busca || a.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(list, page, 25);

  const openNew = () => { setEditing(null); setForm({ nome: "", empresa_id: "", ativo: true }); setDialogOpen(true); };
  const openEdit = (a: any) => { setEditing(a); setForm({ nome: a.nome, empresa_id: a.empresa_id, ativo: a.ativo }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.empresa_id) { toast({ title: "Nome e empresa obrigatórios", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), empresa_id: form.empresa_id, ativo: form.ativo };
    if (editing) {
      const { error } = await supabase.from("areas").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "editar_area", entidade: "areas", entidade_id: editing.id, resumo: `Editada: ${form.nome}` });
      toast({ title: "Área atualizada" });
    } else {
      const { data, error } = await supabase.from("areas").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "criar_area", entidade: "areas", entidade_id: data?.id, resumo: `Criada: ${form.nome}` });
      toast({ title: "Área criada" });
    }
    qc.invalidateQueries({ queryKey: ["areas"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("areas").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "excluir_area", entidade: "areas", entidade_id: deleteId });
    toast({ title: "Área excluída" });
    qc.invalidateQueries({ queryKey: ["areas"] });
    setDeleteId(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Áreas</CardTitle>
        {canEdit && <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova Área</Button>}
      </CardHeader>
      <CardContent>
        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar áreas..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Nome</th><th className="pb-2 font-medium">Empresa</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium w-20">Ações</th>
                </tr></thead>
                <tbody>
                  {paginatedItems.length === 0 && <tr><td colSpan={4}><EmptyState message="Nenhuma área encontrada." /></td></tr>}
                  {paginatedItems.map((area: any) => (
                    <tr key={area.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-medium">{area.nome}</td>
                      <td className="py-3 text-muted-foreground">{area.empresas?.nome || "—"}</td>
                      <td className="py-3"><Badge variant={area.ativo ? "default" : "secondary"}>{area.ativo ? "Ativo" : "Inativo"}</Badge></td>
                      <td className="py-3"><div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(area)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(area.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination totalItems={list.length} pageSize={25} currentPage={safePage} onPageChange={setPage} />
          </>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Editar Área" : "Nova Área"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Empresa</Label>
              <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>{(empresas as any[] ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir área?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
