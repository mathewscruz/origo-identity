import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { usePerfilAcesso, usePerfilComposicao, usePerfilAtribuicoes, useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
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

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
};

export default function PerfilAcessoDetalhePage() {
  const { id } = useParams();
  const { data: perfil, isLoading } = usePerfilAcesso(id);
  const { data: composicao } = usePerfilComposicao(id);
  const { data: atribuicoes } = usePerfilAtribuicoes(id);
  const { data: aplicacoes } = useAplicacoes();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Edit perfil dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nome: "", descricao: "", aplicacao_id: "", tipo: "funcional", sensibilidade: "media", ativo: true });
  const [saving, setSaving] = useState(false);

  // Add composicao dialog
  const [compOpen, setCompOpen] = useState(false);
  const [compForm, setCompForm] = useState({ tipo: "grupo", nome: "", detalhe: "" });

  const openEdit = () => {
    if (!perfil) return;
    setEditForm({ nome: perfil.nome, descricao: perfil.descricao || "", aplicacao_id: perfil.aplicacao_id || "", tipo: perfil.tipo, sensibilidade: perfil.sensibilidade, ativo: perfil.ativo });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("perfis_acesso").update({
        nome: editForm.nome.trim(), descricao: editForm.descricao.trim() || null,
        aplicacao_id: editForm.aplicacao_id || null, tipo: editForm.tipo as any,
        sensibilidade: editForm.sensibilidade as any, ativo: editForm.ativo,
      }).eq("id", id!);
      if (error) throw error;
      toast({ title: "Perfil atualizado" });
      queryClient.invalidateQueries({ queryKey: ["perfil_acesso", id] });
      queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
      setEditOpen(false);
    } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
    setSaving(false);
  };

  const handleAddComp = async () => {
    if (!compForm.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    try {
      const { error } = await supabase.from("perfil_composicao").insert({ perfil_id: id!, tipo: compForm.tipo, nome: compForm.nome.trim(), detalhe: compForm.detalhe.trim() || null });
      if (error) throw error;
      toast({ title: "Item adicionado" });
      queryClient.invalidateQueries({ queryKey: ["perfil_composicao", id] });
      setCompOpen(false);
      setCompForm({ tipo: "grupo", nome: "", detalhe: "" });
    } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
  };

  const handleDeleteComp = async (compId: string) => {
    try {
      const { error } = await supabase.from("perfil_composicao").delete().eq("id", compId);
      if (error) throw error;
      toast({ title: "Item removido" });
      queryClient.invalidateQueries({ queryKey: ["perfil_composicao", id] });
    } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
  };

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!perfil) return <div className="p-8 text-center text-muted-foreground">Perfil não encontrado.</div>;

  const sens = sensibilidadeConfig[perfil.sensibilidade] || { label: perfil.sensibilidade, class: "" };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/perfis-acesso"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
            <Badge variant="outline" className={sens.class}>{sens.label}</Badge>
            <Badge variant="outline">{perfil.tipo}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{perfil.descricao || "Sem descrição"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Sensibilidade</p><p className="text-lg font-semibold">{sens.label}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Itens composição</p><p className="text-lg font-semibold">{composicao?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pessoas atribuídas</p><p className="text-lg font-semibold">{atribuicoes?.length ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="composicao">
        <TabsList>
          <TabsTrigger value="composicao">Composição ({composicao?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas Atribuídas ({atribuicoes?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="composicao" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Itens de Composição</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setCompOpen(true)}><Plus className="mr-1 h-3 w-3" />Adicionar</Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Tipo</th><th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Detalhe</th><th className="p-4 font-medium w-16"></th>
                </tr></thead>
                <tbody>
                  {(composicao ?? []).map((item: any) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-4"><Badge variant="outline">{item.tipo}</Badge></td>
                      <td className="p-4 font-medium">{item.nome}</td>
                      <td className="p-4 text-muted-foreground">{item.detalhe || "—"}</td>
                      <td className="p-4">
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Remover item?</AlertDialogTitle><AlertDialogDescription>O item "{item.nome}" será removido da composição.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteComp(item.id)}>Remover</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                  {(composicao ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhum item de composição cadastrado.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pessoas" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Cargo</th><th className="p-4 font-medium">Área</th><th className="p-4 font-medium">Origem</th>
              </tr></thead>
              <tbody>
                {(atribuicoes ?? []).map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="p-4 font-medium text-primary">{(a.colaboradores as any)?.nome || "—"}</td>
                    <td className="p-4 text-muted-foreground">{(a.colaboradores as any)?.cargos?.nome || "—"}</td>
                    <td className="p-4 text-muted-foreground">{(a.colaboradores as any)?.areas?.nome || "—"}</td>
                    <td className="p-4"><Badge variant="outline" className={origemColors[a.origem || "manual"]}>{a.origem === "regra" ? "Regra" : a.origem === "excecao" ? "Exceção" : "Manual"}</Badge></td>
                  </tr>
                ))}
                {(atribuicoes ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhuma pessoa atribuída a este perfil.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Edit Perfil Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar Perfil</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={editForm.descricao} onChange={e => setEditForm({ ...editForm, descricao: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Aplicação</Label>
                <Select value={editForm.aplicacao_id || undefined} onValueChange={v => setEditForm({ ...editForm, aplicacao_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>{(aplicacoes ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={editForm.tipo} onValueChange={v => setEditForm({ ...editForm, tipo: v })}>
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
                <Select value={editForm.sensibilidade} onValueChange={v => setEditForm({ ...editForm, sensibilidade: v })}>
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
                <Switch checked={editForm.ativo} onCheckedChange={v => setEditForm({ ...editForm, ativo: v })} />
                <Label>Ativo</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Salvando..." : "Atualizar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Composicao Dialog */}
      <Dialog open={compOpen} onOpenChange={setCompOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Item de Composição</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={compForm.tipo} onValueChange={v => setCompForm({ ...compForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grupo">Grupo</SelectItem>
                  <SelectItem value="role">Role</SelectItem>
                  <SelectItem value="permissao">Permissão</SelectItem>
                  <SelectItem value="licenca">Licença</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Nome *</Label><Input value={compForm.nome} onChange={e => setCompForm({ ...compForm, nome: e.target.value })} placeholder="Ex: SG-Financeiro-RW" /></div>
            <div className="space-y-2"><Label>Detalhe</Label><Input value={compForm.detalhe} onChange={e => setCompForm({ ...compForm, detalhe: e.target.value })} placeholder="Informação adicional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddComp}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
