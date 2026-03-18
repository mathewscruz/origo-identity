import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { usePerfisAcesso, useAplicacoes, useEntraLicencas, useEntraGrupos } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PerfilForm {
  nome: string;
  descricao: string;
  aplicacao_ids: string[];
  licenca_ids: string[];
  grupo_ids: string[];
  tipo: string;
  ativo: boolean;
}

const emptyForm: PerfilForm = { nome: "", descricao: "", aplicacao_ids: [], licenca_ids: [], grupo_ids: [], tipo: "funcional", ativo: true };

export default function PerfisAcessoPage() {
  const { data: perfis, isLoading } = usePerfisAcesso();
  const { data: aplicacoes } = useAplicacoes();
  const { data: entraLicencas } = useEntraLicencas();
  const { data: entraGrupos } = useEntraGrupos();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaApps, setBuscaApps] = useState("");
  const [buscaLicencas, setBuscaLicencas] = useState("");
  const [buscaGrupos, setBuscaGrupos] = useState("");
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
  const openEdit = async (p: any) => {
    const { data: apps } = await (supabase as any).from("perfil_aplicacoes").select("aplicacao_id").eq("perfil_id", p.id);
    const { data: lics } = await (supabase as any).from("perfil_licencas").select("licenca_id").eq("perfil_id", p.id);
    const { data: grps } = await (supabase as any).from("perfil_grupos").select("grupo_id").eq("perfil_id", p.id);
    setForm({
      nome: p.nome, descricao: p.descricao || "",
      aplicacao_ids: (apps ?? []).map((a: any) => a.aplicacao_id),
      licenca_ids: (lics ?? []).map((l: any) => l.licenca_id),
      grupo_ids: (grps ?? []).map((g: any) => g.grupo_id),
      tipo: p.tipo, ativo: p.ativo,
    });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const toggleItem = (field: "aplicacao_ids" | "licenca_ids" | "grupo_ids", itemId: string) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(itemId) ? prev[field].filter(id => id !== itemId) : [...prev[field], itemId],
    }));
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { nome: form.nome.trim(), descricao: form.descricao.trim() || null, tipo: form.tipo as any, ativo: form.ativo };
      let perfilId = editingId;
      if (editingId) {
        const { error } = await supabase.from("perfis_acesso").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("perfis_acesso").insert(payload).select("id").single();
        if (error) throw error;
        perfilId = data.id;
      }

      // Sync perfil_aplicacoes
      await (supabase as any).from("perfil_aplicacoes").delete().eq("perfil_id", perfilId);
      if (form.aplicacao_ids.length > 0) {
        await (supabase as any).from("perfil_aplicacoes").insert(form.aplicacao_ids.map(aid => ({ perfil_id: perfilId, aplicacao_id: aid })));
      }

      // Sync perfil_licencas
      await (supabase as any).from("perfil_licencas").delete().eq("perfil_id", perfilId);
      if (form.licenca_ids.length > 0) {
        await (supabase as any).from("perfil_licencas").insert(form.licenca_ids.map(lid => ({ perfil_id: perfilId, licenca_id: lid })));
      }

      // Sync perfil_grupos
      await (supabase as any).from("perfil_grupos").delete().eq("perfil_id", perfilId);
      if (form.grupo_ids.length > 0) {
        await (supabase as any).from("perfil_grupos").insert(form.grupo_ids.map(gid => ({ perfil_id: perfilId, grupo_id: gid })));
      }

      toast({ title: editingId ? "Perfil atualizado" : "Perfil criado" });
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
          <p className="text-sm text-muted-foreground">Perfis baseados em cargo com múltiplas aplicações vinculadas</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size={syncing ? "default" : "icon"}
            disabled={syncing}
            title="Sincronizar Entra ID (apps, licenças, grupos)"
            onClick={async () => {
              setSyncing(true);
              setSyncMessage("Iniciando...");
              try {
                const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
                const res = await fetch(`https://${projectId}.supabase.co/functions/v1/sync-entra-id`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
                });
                const reader = res.body?.getReader();
                if (reader) {
                  const decoder = new TextDecoder();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const text = decoder.decode(value);
                    const lines = text.split("\n").filter(l => l.startsWith("data: "));
                    for (const line of lines) {
                      try {
                        const evt = JSON.parse(line.replace("data: ", ""));
                        if (evt.message) setSyncMessage(evt.message);
                        if (evt.phase === "done") {
                          toast({ title: "Sincronização concluída!", description: `${evt.apps?.total ?? 0} apps, ${evt.licencas ?? 0} licenças, ${evt.grupos ?? 0} grupos` });
                        }
                        if (evt.phase === "error") toast({ title: "Erro na sincronização", description: evt.error, variant: "destructive" });
                      } catch { /* skip */ }
                    }
                  }
                }
                queryClient.invalidateQueries({ queryKey: ["aplicacoes"] });
                queryClient.invalidateQueries({ queryKey: ["entra_licencas"] });
                queryClient.invalidateQueries({ queryKey: ["entra_grupos"] });
                queryClient.invalidateQueries({ queryKey: ["sync_jobs"] });
              } catch (err: any) {
                toast({ title: "Erro", description: err.message, variant: "destructive" });
              }
              setSyncing(false);
              setSyncMessage("");
            }}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing && <span className="text-xs">{syncMessage}</span>}
          </Button>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Perfil</Button>
        </div>
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
                    <th className="p-4 font-medium">Aplicações</th>
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((p: any) => {
                    const apps = (p.perfil_aplicacoes ?? []).map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4"><Link to={`/perfis-acesso/${p.id}`} className="font-medium text-primary hover:underline">{p.nome}</Link></td>
                        <td className="p-4">
                          {apps.length === 0 ? <span className="text-muted-foreground">—</span> : (
                            <div className="flex flex-wrap gap-1">
                              {apps.slice(0, 3).map((name: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs">{name}</Badge>
                              ))}
                              {apps.length > 3 && <Badge variant="secondary" className="text-xs">+{apps.length - 3}</Badge>}
                            </div>
                          )}
                        </td>
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

      {/* Dialog Novo/Editar Perfil - com Tabs */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>{editingId ? "Editar Perfil" : "Novo Perfil de Acesso"}</DialogTitle></DialogHeader>
          
          <Tabs defaultValue="geral" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="aplicacoes">Aplicações ({form.aplicacao_ids.length})</TabsTrigger>
              <TabsTrigger value="licencas">Licenças ({form.licenca_ids.length})</TabsTrigger>
              <TabsTrigger value="grupos">Grupos ({form.grupo_ids.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="mt-4 space-y-4 overflow-auto flex-1">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Especialista de Segurança da Informação" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva o perfil" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={form.ativo} onCheckedChange={v => setForm({ ...form, ativo: v })} />
                  <Label>Ativo</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="aplicacoes" className="mt-4 overflow-auto flex-1">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar aplicações..." className="pl-9" value={buscaApps} onChange={e => setBuscaApps(e.target.value)} />
              </div>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(aplicacoes ?? []).filter((a: any) => !buscaApps || a.nome.toLowerCase().includes(buscaApps.toLowerCase())).map((a: any) => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox checked={form.aplicacao_ids.includes(a.id)} onCheckedChange={() => toggleItem("aplicacao_ids", a.id)} />
                      <span className="text-sm">{a.nome}</span>
                    </label>
                  ))}
                  {(aplicacoes ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma aplicação cadastrada. Sincronize com o Entra ID primeiro.</p>}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="licencas" className="mt-4 overflow-auto flex-1">
              <p className="text-xs text-muted-foreground mb-2">Selecione as licenças Microsoft que serão atribuídas aos usuários deste perfil.</p>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar licenças..." className="pl-9" value={buscaLicencas} onChange={e => setBuscaLicencas(e.target.value)} />
              </div>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(entraLicencas ?? []).filter((lic: any) => !buscaLicencas || lic.nome.toLowerCase().includes(buscaLicencas.toLowerCase())).map((lic: any) => (
                    <label key={lic.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={form.licenca_ids.includes(lic.id)} onCheckedChange={() => toggleItem("licenca_ids", lic.id)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{lic.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2">({lic.em_uso}/{lic.total} em uso)</span>
                      </div>
                    </label>
                  ))}
                  {(entraLicencas ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma licença encontrada. Sincronize com o Entra ID primeiro.</p>}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="grupos" className="mt-4 overflow-auto flex-1">
              <p className="text-xs text-muted-foreground mb-3">Selecione os grupos do Entra ID que os usuários deste perfil receberão.</p>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(entraGrupos ?? []).map((grp: any) => (
                    <label key={grp.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={form.grupo_ids.includes(grp.id)} onCheckedChange={() => toggleItem("grupo_ids", grp.id)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{grp.nome}</span>
                        {grp.descricao && <p className="text-xs text-muted-foreground truncate">{grp.descricao}</p>}
                      </div>
                    </label>
                  ))}
                  {(entraGrupos ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo encontrado. Sincronize com o Entra ID primeiro.</p>}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editingId ? "Atualizar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
