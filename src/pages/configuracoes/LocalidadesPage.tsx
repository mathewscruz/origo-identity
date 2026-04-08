import { useState } from "react";
import { useCanEdit } from "@/hooks/useRole";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useLocalidades, useEmpresas } from "@/hooks/useOrigoData";
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

export default function LocalidadesPage() {
  const canEdit = useCanEdit();
  const { data: localidades, isLoading } = useLocalidades();
  const { data: empresas } = useEmpresas();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", empresa_id: "", ativo: true });
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (localidades ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, 25);

  const openNew = () => { setEditing(null); setForm({ nome: "", empresa_id: "", ativo: true }); setDialogOpen(true); };
  const openEdit = (l: any) => { setEditing(l); setForm({ nome: l.nome, empresa_id: l.empresa_id, ativo: l.ativo }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.empresa_id) { toast({ title: "Nome e empresa obrigatórios", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), empresa_id: form.empresa_id, ativo: form.ativo };
    if (editing) {
      const { error } = await supabase.from("localidades").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "editar_localidade", entidade: "localidades", entidade_id: editing.id, resumo: `Editada: ${form.nome}` });
      toast({ title: "Localidade atualizada" });
    } else {
      const { data, error } = await supabase.from("localidades").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "criar_localidade", entidade: "localidades", entidade_id: data?.id, resumo: `Criada: ${form.nome}` });
      toast({ title: "Localidade criada" });
    }
    qc.invalidateQueries({ queryKey: ["localidades"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("localidades").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "excluir_localidade", entidade: "localidades", entidade_id: deleteId });
    toast({ title: "Localidade excluída" });
    qc.invalidateQueries({ queryKey: ["localidades"] });
    setDeleteId(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Localidades</CardTitle>
        {canEdit && <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova Localidade</Button>}
      </CardHeader>
      <CardContent>
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
                  {paginatedItems.length === 0 && <tr><td colSpan={4}><EmptyState message="Nenhuma localidade cadastrada." /></td></tr>}
                  {paginatedItems.map((loc: any) => (
                    <tr key={loc.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-medium">{loc.nome}</td>
                      <td className="py-3 text-muted-foreground">{loc.empresas?.nome || "—"}</td>
                      <td className="py-3"><Badge variant={loc.ativo ? "default" : "secondary"}>{loc.ativo ? "Ativo" : "Inativo"}</Badge></td>
                      <td className="py-3"><div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(loc.id)}><Trash2 className="h-3 w-3" /></Button>
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
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Editar Localidade" : "Nova Localidade"}</DialogTitle></DialogHeader>
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
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir localidade?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
