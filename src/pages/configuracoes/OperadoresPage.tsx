import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useOperadores } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";

export default function OperadoresPage() {
  const { data: operadores, isLoading } = useOperadores();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", email: "", ativo: true });
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = (operadores ?? []) as any[];
  const { paginatedItems, safePage } = usePagination(list, page, 25);

  const openNew = () => { setEditing(null); setForm({ nome: "", email: "", ativo: true }); setDialogOpen(true); };
  const openEdit = (o: any) => { setEditing(o); setForm({ nome: o.nome, email: o.email, ativo: o.ativo }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.email.trim()) { toast({ title: "Nome e email obrigatórios", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), email: form.email.trim(), ativo: form.ativo };
    if (editing) {
      const { error } = await supabase.from("operadores").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "editar_operador", entidade: "operadores", entidade_id: editing.id, resumo: `Editado: ${form.nome}` });
      toast({ title: "Operador atualizado" });
    } else {
      const { data, error } = await supabase.from("operadores").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "criar_operador", entidade: "operadores", entidade_id: data?.id, resumo: `Criado: ${form.nome}` });
      toast({ title: "Operador criado" });
    }
    qc.invalidateQueries({ queryKey: ["operadores"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("operadores").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "excluir_operador", entidade: "operadores", entidade_id: deleteId });
    toast({ title: "Operador excluído" });
    qc.invalidateQueries({ queryKey: ["operadores"] });
    setDeleteId(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Operadores</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Operador</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">Nome</th><th className="pb-2 font-medium">Email</th><th className="pb-2 font-medium">Status</th><th className="pb-2 font-medium w-20">Ações</th>
                </tr></thead>
                <tbody>
                  {paginatedItems.map((op: any) => (
                    <tr key={op.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 font-medium">{op.nome}</td>
                      <td className="py-3 text-muted-foreground">{op.email}</td>
                      <td className="py-3"><Badge variant={op.ativo ? "default" : "secondary"}>{op.ativo ? "Ativo" : "Inativo"}</Badge></td>
                      <td className="py-3"><div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(op)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(op.id)}><Trash2 className="h-3 w-3" /></Button>
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
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Editar Operador" : "Novo Operador"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir operador?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
