import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { usePerfilAcesso, usePerfilComposicao, usePerfilAtribuicoes, useAplicacoes, useEntraLicencas, useEntraGrupos } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
// provisionCargoAcessos removed — now using central entraQueueHelper
import { generateEntraQueueForDiff, findAffectedCollaborators } from "@/lib/entraQueueHelper";

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
  cargo: "bg-info/15 text-info border-info/30",
};

export default function PerfilAcessoDetalhePage() {
  const { id } = useParams();
  const { data: perfil, isLoading } = usePerfilAcesso(id);
  const { data: composicao } = usePerfilComposicao(id);
  const { data: atribuicoes } = usePerfilAtribuicoes(id);
  const { data: aplicacoes } = useAplicacoes();
  const { data: entraLicencas } = useEntraLicencas();
  const { data: entraGrupos } = useEntraGrupos();
  const { data: perfilApps } = useQuery({
    queryKey: ["perfil_aplicacoes", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await (supabase as any).from("perfil_aplicacoes").select("*, aplicacoes(nome)").eq("perfil_id", id!); if (error) throw error; return data ?? []; },
  });
  const { data: perfilLicencas } = useQuery({
    queryKey: ["perfil_licencas", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await (supabase as any).from("perfil_licencas").select("*, entra_licencas(nome, sku_id, total, em_uso)").eq("perfil_id", id!); if (error) throw error; return data ?? []; },
  });
  const { data: perfilGrupos } = useQuery({
    queryKey: ["perfil_grupos", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await (supabase as any).from("perfil_grupos").select("*, entra_grupos(nome, descricao)").eq("perfil_id", id!); if (error) throw error; return data ?? []; },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nome: "", descricao: "", tipo: "funcional", ativo: true, aplicacao_ids: [] as string[], licenca_ids: [] as string[], grupo_ids: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [compForm, setCompForm] = useState({ tipo: "grupo", nome: "", detalhe: "" });

  const openEdit = () => {
    if (!perfil) return;
    setEditForm({
      nome: perfil.nome, descricao: perfil.descricao || "", tipo: perfil.tipo, ativo: perfil.ativo,
      aplicacao_ids: (perfilApps ?? []).map((pa: any) => pa.aplicacao_id),
      licenca_ids: (perfilLicencas ?? []).map((pl: any) => pl.licenca_id),
      grupo_ids: (perfilGrupos ?? []).map((pg: any) => pg.grupo_id),
    });
    setEditOpen(true);
  };

  const toggleItem = (field: "aplicacao_ids" | "licenca_ids" | "grupo_ids", itemId: string) => {
    setEditForm(prev => ({
      ...prev,
      [field]: prev[field].includes(itemId) ? prev[field].filter(i => i !== itemId) : [...prev[field], itemId],
    }));
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("perfis_acesso").update({
        nome: editForm.nome.trim(), descricao: editForm.descricao.trim() || null,
        tipo: editForm.tipo as any, ativo: editForm.ativo,
      }).eq("id", id!);
      if (error) throw error;

      // Sync apps
      await (supabase as any).from("perfil_aplicacoes").delete().eq("perfil_id", id!);
      if (editForm.aplicacao_ids.length > 0) await (supabase as any).from("perfil_aplicacoes").insert(editForm.aplicacao_ids.map(aid => ({ perfil_id: id!, aplicacao_id: aid })));

      // Sync licencas
      await (supabase as any).from("perfil_licencas").delete().eq("perfil_id", id!);
      if (editForm.licenca_ids.length > 0) await (supabase as any).from("perfil_licencas").insert(editForm.licenca_ids.map(lid => ({ perfil_id: id!, licenca_id: lid })));

      // Sync grupos
      await (supabase as any).from("perfil_grupos").delete().eq("perfil_id", id!);
      if (editForm.grupo_ids.length > 0) await (supabase as any).from("perfil_grupos").insert(editForm.grupo_ids.map(gid => ({ perfil_id: id!, grupo_id: gid })));

      toast({ title: "Perfil atualizado" });

      // Calculate diff between old and new state
      const oldGrupoIds = (perfilGrupos ?? []).map((pg: any) => pg.grupo_id as string);
      const oldLicencaIds = (perfilLicencas ?? []).map((pl: any) => pl.licenca_id as string);
      const oldAppIds = (perfilApps ?? []).map((pa: any) => pa.aplicacao_id as string);

      const addedGrupos = editForm.grupo_ids.filter(gid => !oldGrupoIds.includes(gid));
      const removedGrupos = oldGrupoIds.filter(gid => !editForm.grupo_ids.includes(gid));
      const addedLicencas = editForm.licenca_ids.filter(lid => !oldLicencaIds.includes(lid));
      const removedLicencas = oldLicencaIds.filter(lid => !editForm.licenca_ids.includes(lid));
      const addedApps = editForm.aplicacao_ids.filter(aid => !oldAppIds.includes(aid));
      const removedApps = oldAppIds.filter(aid => !editForm.aplicacao_ids.includes(aid));

      const hasChanges = addedGrupos.length + removedGrupos.length + addedLicencas.length + removedLicencas.length + addedApps.length + removedApps.length > 0;

      if (hasChanges) {
        try {
          // Find ALL affected collaborators: direct assignments + via cargo
          const affectedColabs = await findAffectedCollaborators(id!);

          if (affectedColabs.length > 0) {
            const queued = await generateEntraQueueForDiff(affectedColabs, {
              addedGrupoIds: addedGrupos,
              removedGrupoIds: removedGrupos,
              addedLicencaIds: addedLicencas,
              removedLicencaIds: removedLicencas,
              addedAppIds: addedApps,
              removedAppIds: removedApps,
            }, { triggerImmediately: false });

            if (queued > 0) {
              toast({ title: `${queued} ação(ões) gerada(s) para o Entra ID` });
            }
          }
        } catch (err) {
          console.error("Queue insert error:", err);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["perfil_acesso", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_aplicacoes", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_licencas", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_grupos", id] });
      queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
      setEditOpen(false);
      triggerEntraProcessing();
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

  const appNames = (perfilApps ?? []).map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
  const licNames = (perfilLicencas ?? []).map((pl: any) => pl.entra_licencas).filter(Boolean);
  const grpNames = (perfilGrupos ?? []).map((pg: any) => pg.entra_grupos).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/perfis-acesso"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
            <Badge variant="outline">{perfil.tipo}</Badge>
            <Badge variant={perfil.ativo ? "default" : "secondary"}>{perfil.ativo ? "Ativo" : "Inativo"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{perfil.descricao || "Sem descrição"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Aplicações</p><p className="text-lg font-semibold">{appNames.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Licenças</p><p className="text-lg font-semibold">{licNames.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Grupos</p><p className="text-lg font-semibold">{grpNames.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Composição</p><p className="text-lg font-semibold">{composicao?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pessoas</p><p className="text-lg font-semibold">{atribuicoes?.length ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="aplicacoes">
        <TabsList>
          <TabsTrigger value="aplicacoes">Aplicações ({appNames.length})</TabsTrigger>
          <TabsTrigger value="licencas">Licenças ({licNames.length})</TabsTrigger>
          <TabsTrigger value="grupos">Grupos ({grpNames.length})</TabsTrigger>
          <TabsTrigger value="composicao">Composição ({composicao?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas ({atribuicoes?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="aplicacoes" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-4 font-medium">Aplicação</th></tr></thead>
              <tbody>
                {appNames.map((name: string, i: number) => (
                  <tr key={i} className="border-b last:border-0"><td className="p-4 font-medium">{name}</td></tr>
                ))}
                {appNames.length === 0 && <tr><td className="p-8 text-center text-muted-foreground">Nenhuma aplicação vinculada.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="licencas" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Licença</th>
                <th className="p-4 font-medium">SKU</th>
                <th className="p-4 font-medium">Uso</th>
              </tr></thead>
              <tbody>
                {licNames.map((lic: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-4 font-medium">{lic.nome}</td>
                    <td className="p-4 text-muted-foreground text-xs font-mono">{lic.sku_id}</td>
                    <td className="p-4"><Badge variant="outline">{lic.em_uso}/{lic.total}</Badge></td>
                  </tr>
                ))}
                {licNames.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Nenhuma licença vinculada.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="grupos" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Grupo</th>
                <th className="p-4 font-medium">Descrição</th>
              </tr></thead>
              <tbody>
                {grpNames.map((grp: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-4 font-medium">{grp.nome}</td>
                    <td className="p-4 text-muted-foreground">{grp.descricao || "—"}</td>
                  </tr>
                ))}
                {grpNames.length === 0 && <tr><td colSpan={2} className="p-8 text-center text-muted-foreground">Nenhum grupo vinculado.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

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
                            <AlertDialogHeader><AlertDialogTitle>Remover item?</AlertDialogTitle><AlertDialogDescription>O item "{item.nome}" será removido.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteComp(item.id)}>Remover</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))}
                  {(composicao ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhum item de composição.</td></tr>}
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
                    <td className="p-4"><Badge variant="outline" className={origemColors[a.origem || "manual"]}>{a.origem === "regra" ? "Regra" : a.origem === "excecao" ? "Exceção" : a.origem === "cargo" ? "Cargo" : "Manual"}</Badge></td>
                  </tr>
                ))}
                {(atribuicoes ?? []).length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Nenhuma pessoa atribuída.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* Edit Perfil Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>Editar Perfil</DialogTitle></DialogHeader>
          <Tabs defaultValue="geral" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="aplicacoes">Aplicações ({editForm.aplicacao_ids.length})</TabsTrigger>
              <TabsTrigger value="licencas">Licenças ({editForm.licenca_ids.length})</TabsTrigger>
              <TabsTrigger value="grupos">Grupos ({editForm.grupo_ids.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="mt-4 space-y-4 overflow-auto flex-1">
              <div className="space-y-2"><Label>Nome *</Label><Input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} /></div>
              <div className="space-y-2"><Label>Descrição</Label><Textarea value={editForm.descricao} onChange={e => setEditForm({ ...editForm, descricao: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-2 gap-4">
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
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={editForm.ativo} onCheckedChange={v => setEditForm({ ...editForm, ativo: v })} />
                  <Label>Ativo</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="aplicacoes" className="mt-4 overflow-auto flex-1">
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(aplicacoes ?? []).map((a: any) => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox checked={editForm.aplicacao_ids.includes(a.id)} onCheckedChange={() => toggleItem("aplicacao_ids", a.id)} />
                      <span className="text-sm">{a.nome}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="licencas" className="mt-4 overflow-auto flex-1">
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(entraLicencas ?? []).map((lic: any) => (
                    <label key={lic.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={editForm.licenca_ids.includes(lic.id)} onCheckedChange={() => toggleItem("licenca_ids", lic.id)} />
                      <span className="text-sm font-medium">{lic.nome}</span>
                      <span className="text-xs text-muted-foreground">({lic.em_uso}/{lic.total})</span>
                    </label>
                  ))}
                  {(entraLicencas ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma licença encontrada.</p>}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="grupos" className="mt-4 overflow-auto flex-1">
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(entraGrupos ?? []).map((grp: any) => (
                    <label key={grp.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={editForm.grupo_ids.includes(grp.id)} onCheckedChange={() => toggleItem("grupo_ids", grp.id)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{grp.nome}</span>
                        {grp.descricao && <p className="text-xs text-muted-foreground truncate">{grp.descricao}</p>}
                      </div>
                    </label>
                  ))}
                  {(entraGrupos ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo encontrado.</p>}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-4 border-t">
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
