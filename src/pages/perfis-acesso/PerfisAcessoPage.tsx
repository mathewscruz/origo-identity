import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { usePerfisAcesso, useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const sensibilidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Normal", class: "bg-muted text-muted-foreground" },
  media: { label: "Sensível", class: "bg-warning/15 text-warning border-warning/30" },
  alta: { label: "Alto", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Privilegiado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

interface PerfilForm {
  nome: string;
  descricao: string;
  aplicacao_id: string;
  tipo: string;
  sensibilidade: string;
  ativo: boolean;
}

const emptyForm: PerfilForm = { nome: "", descricao: "", aplicacao_id: "", tipo: "funcional", sensibilidade: "media", ativo: true };

export default function PerfisAcessoPage() {
  const { data: perfis, isLoading } = usePerfisAcesso();
  const { data: aplicacoes } = useAplicacoes();
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PerfilForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const list = (perfis ?? []).filter((p: any) => !busca || p.nome.toLowerCase().includes(busca.toLowerCase()));
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  const openNew = () => { setForm(emptyForm); setEditingId(null); setDialogOpen(true); };
  const openEdit = (p: any) => {
    setForm({ nome: p.nome, descricao: p.descricao || "", aplicacao_id: p.aplicacao_id || "", tipo: p.tipo, sensibilidade: p.sensibilidade, ativo: p.ativo });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        aplicacao_id: form.aplicacao_id || null,
        tipo: form.tipo as any,
        sensibilidade: form.sensibilidade as any,
        ativo: form.ativo,
      };
      if (editingId) {
        const { error } = await supabase.from("perfis_acesso").update(payload).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Perfil atualizado" });
      } else {
        const { error } = await supabase.from("perfis_acesso").insert(payload);
        if (error) throw error;
        toast({ title: "Perfil criado" });
      }
      queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("perfis_acesso").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Perfil excluído" });
      queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perfis de Acesso</h1>
          <p className="text-sm text-muted-foreground">Conjuntos nomeados de acessos a aplicações</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Perfil</Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar perfis..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
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
                    <th className="p-4 font-medium">Aplicação</th>
                    <th className="p-4 font-medium">Sensibilidade</th>
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((p: any) => {
                    const sens = sensibilidadeConfig[p.sensibilidade] || { label: p.sensibilidade, class: "" };
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4"><Link to={`/perfis-acesso/${p.id}`} className="font-medium text-primary hover:underline">{p.nome}</Link></td>
                        <td className="p-4 text-muted-foreground">{p.aplicacoes?.nome || "—"}</td>
                        <td className="p-4"><Badge variant="outline" className={sens.class}>{sens.label}</Badge></td>
                        <td className="p-4"><Badge variant="outline">{p.tipo}</Badge></td>
                        <td className="p-4"><Badge variant={p.ativo ? "default" : "secondary"}>{p.ativo ? "Ativo" : "Inativo"}</Badge></td>
                        <td className="p-4">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Excluir perfil?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Todas as atribuições associadas serão afetadas.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(p.id)}>Excluir</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <TablePagination totalItems={list.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Editar Perfil" : "Novo Perfil de Acesso"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Acesso Financeiro" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva o perfil" rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Aplicação</Label>
                <Select value={form.aplicacao_id || undefined} onValueChange={v => setForm({ ...form, aplicacao_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>{(aplicacoes ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="funcional">Funcional</SelectItem>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                    <SelectItem value="privilegiado">Privilegiado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sensibilidade</Label>
                <Select value={form.sensibilidade} onValueChange={v => setForm({ ...form, sensibilidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Normal</SelectItem>
                    <SelectItem value="media">Sensível</SelectItem>
                    <SelectItem value="alta">Alto</SelectItem>
                    <SelectItem value="critica">Privilegiado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
                <Label>Ativo</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editingId ? "Atualizar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
