import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Trash2, Shield, ShieldCheck, ShieldAlert } from "lucide-react";
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
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { findAffectedCollaborators, generateEntraQueueForDiff, queueFullProfileActions } from "@/lib/entraQueueHelper";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria } from "@/lib/auditLogger";

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

  // Fetch counts for extra columns
  const { data: atribuicoesCounts } = useQuery({
    queryKey: ["perfil_atribuicoes_counts"],
    queryFn: async () => {
      const { data } = await supabase.from("perfil_atribuicoes").select("perfil_id").eq("ativo", true);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((a: any) => { counts[a.perfil_id] = (counts[a.perfil_id] || 0) + 1; });
      return counts;
    },
  });
  const { data: licencasCounts } = useQuery({
    queryKey: ["perfil_licencas_counts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("perfil_licencas").select("perfil_id");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((a: any) => { counts[a.perfil_id] = (counts[a.perfil_id] || 0) + 1; });
      return counts;
    },
  });
  const { data: gruposCounts } = useQuery({
    queryKey: ["perfil_grupos_counts"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("perfil_grupos").select("perfil_id");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((a: any) => { counts[a.perfil_id] = (counts[a.perfil_id] || 0) + 1; });
      return counts;
    },
  });

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [buscaApps, setBuscaApps] = useState("");
  const [buscaLicencas, setBuscaLicencas] = useState("");
  const [buscaGrupos, setBuscaGrupos] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PerfilForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const allPerfis = perfis ?? [];
  const list = allPerfis.filter((p: any) => {
    if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
    if (filtroStatus === "ativo" && !p.ativo) return false;
    if (filtroStatus === "inativo" && p.ativo) return false;
    return true;
  });
  const { paginatedItems, safePage } = usePagination(list, page, pageSize);

  // Header counters
  const totalPerfis = allPerfis.length;
  const ativosPerfis = allPerfis.filter((p: any) => p.ativo).length;
  const privilegiadosPerfis = allPerfis.filter((p: any) => p.tipo === "privilegiado").length;

  const openNew = () => { setForm(emptyForm); setEditingId(null); setBuscaApps(""); setBuscaLicencas(""); setBuscaGrupos(""); setDialogOpen(true); };
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
    setBuscaApps(""); setBuscaLicencas(""); setBuscaGrupos("");
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

      let oldGrupoIds: string[] = [];
      let oldLicencaIds: string[] = [];
      let oldAppIds: string[] = [];

      if (editingId) {
        const [oldG, oldL, oldA] = await Promise.all([
          (supabase as any).from("perfil_grupos").select("grupo_id").eq("perfil_id", editingId),
          (supabase as any).from("perfil_licencas").select("licenca_id").eq("perfil_id", editingId),
          (supabase as any).from("perfil_aplicacoes").select("aplicacao_id").eq("perfil_id", editingId),
        ]);
        oldGrupoIds = (oldG.data ?? []).map((r: any) => r.grupo_id);
        oldLicencaIds = (oldL.data ?? []).map((r: any) => r.licenca_id);
        oldAppIds = (oldA.data ?? []).map((r: any) => r.aplicacao_id);
      }

      if (editingId) {
        const { error } = await supabase.from("perfis_acesso").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("perfis_acesso").insert(payload).select("id").single();
        if (error) throw error;
        perfilId = data.id;
      }

      await (supabase as any).from("perfil_aplicacoes").delete().eq("perfil_id", perfilId);
      if (form.aplicacao_ids.length > 0) await (supabase as any).from("perfil_aplicacoes").insert(form.aplicacao_ids.map(aid => ({ perfil_id: perfilId, aplicacao_id: aid })));

      await (supabase as any).from("perfil_licencas").delete().eq("perfil_id", perfilId);
      if (form.licenca_ids.length > 0) await (supabase as any).from("perfil_licencas").insert(form.licenca_ids.map(lid => ({ perfil_id: perfilId, licenca_id: lid })));

      await (supabase as any).from("perfil_grupos").delete().eq("perfil_id", perfilId);
      if (form.grupo_ids.length > 0) await (supabase as any).from("perfil_grupos").insert(form.grupo_ids.map(gid => ({ perfil_id: perfilId, grupo_id: gid })));

      // Entra ID provisioning diff
      if (perfilId) {
        const diff = {
          addedGrupoIds: form.grupo_ids.filter(id => !oldGrupoIds.includes(id)),
          removedGrupoIds: oldGrupoIds.filter(id => !form.grupo_ids.includes(id)),
          addedLicencaIds: form.licenca_ids.filter(id => !oldLicencaIds.includes(id)),
          removedLicencaIds: oldLicencaIds.filter(id => !form.licenca_ids.includes(id)),
          addedAppIds: form.aplicacao_ids.filter(id => !oldAppIds.includes(id)),
          removedAppIds: oldAppIds.filter(id => !form.aplicacao_ids.includes(id)),
        };
        const hasDiff = Object.values(diff).some(arr => arr.length > 0);
        if (hasDiff) {
          try {
            const colabs = await findAffectedCollaborators(perfilId);
            if (colabs.length > 0) {
              const queued = await generateEntraQueueForDiff(colabs, diff, { triggerImmediately: false });
              if (queued > 0) {
                toast({ title: "Provisionamento", description: `${queued} ações geradas para ${colabs.length} colaborador(es)` });
                triggerEntraProcessing();
              }
            }
          } catch (provErr) { console.error("[PerfisAcessoPage] Erro no provisionamento:", provErr); }
        }
      }

      await logAuditoria({ acao: editingId ? "editar_perfil" : "criar_perfil", entidade: "perfis_acesso", entidade_id: perfilId || undefined, resumo: `${editingId ? "Editado" : "Criado"}: ${form.nome}` });
      toast({ title: editingId ? "Perfil atualizado" : "Perfil criado" });
      queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
      queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes_counts"] });
      queryClient.invalidateQueries({ queryKey: ["perfil_licencas_counts"] });
      queryClient.invalidateQueries({ queryKey: ["perfil_grupos_counts"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (perfId: string) => {
    setDeleting(true);
    try {
      // Cleanup Entra ID: remove all resources from affected collaborators
      const colabs = await findAffectedCollaborators(perfId);
      if (colabs.length > 0) {
        const queued = await queueFullProfileActions(colabs, [perfId], "remove", { triggerImmediately: false });
        if (queued > 0) {
          toast({ title: "Cleanup Entra ID", description: `${queued} ações de remoção geradas para ${colabs.length} colaborador(es)` });
        }
      }

      // Revoke perfil_atribuicoes
      await supabase.from("perfil_atribuicoes").update({ ativo: false, data_revogacao: new Date().toISOString() } as any).eq("perfil_id", perfId).eq("ativo", true);

      // Delete related records
      await Promise.all([
        (supabase as any).from("perfil_aplicacoes").delete().eq("perfil_id", perfId),
        (supabase as any).from("perfil_licencas").delete().eq("perfil_id", perfId),
        (supabase as any).from("perfil_grupos").delete().eq("perfil_id", perfId),
        (supabase as any).from("cargo_perfis").delete().eq("perfil_id", perfId),
        supabase.from("perfil_composicao").delete().eq("perfil_id", perfId),
      ]);

      const { error } = await supabase.from("perfis_acesso").delete().eq("id", perfId);
      if (error) throw error;

      triggerEntraProcessing();
      await logAuditoria({ acao: "excluir_perfil", entidade: "perfis_acesso", entidade_id: perfId, resumo: `Perfil excluído` });
      toast({ title: "Perfil excluído" });
      queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    }
    setDeleting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Perfis de Acesso</h1>
          <p className="text-sm text-muted-foreground">Perfis baseados em cargo com múltiplas aplicações vinculadas</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Perfil</Button>
      </div>

      {/* Header counters */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-semibold">{totalPerfis}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div><p className="text-xs text-muted-foreground">Ativos</p><p className="text-lg font-semibold">{ativosPerfis}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <div><p className="text-xs text-muted-foreground">Privilegiados</p><p className="text-lg font-semibold">{privilegiadosPerfis}</p></div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar perfis..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={filtroTipo} onValueChange={v => { setFiltroTipo(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="funcional">Funcional</SelectItem>
            <SelectItem value="tecnico">Técnico</SelectItem>
            <SelectItem value="privilegiado">Privilegiado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={v => { setFiltroStatus(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
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
                    <th className="p-4 font-medium">Tipo</th>
                    <th className="p-4 font-medium text-center">Pessoas</th>
                    <th className="p-4 font-medium text-center">Apps</th>
                    <th className="p-4 font-medium text-center">Licenças</th>
                    <th className="p-4 font-medium text-center">Grupos</th>
                    <th className="p-4 font-medium">Status</th>
                    <th className="p-4 font-medium w-20">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((p: any) => {
                    const apps = (p.perfil_aplicacoes ?? []).map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
                    const pessoasCount = atribuicoesCounts?.[p.id] || 0;
                    const licCount = licencasCounts?.[p.id] || 0;
                    const grpCount = gruposCounts?.[p.id] || 0;
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-4">
                          <Link to={`/perfis-acesso/${p.id}`} className="font-medium text-primary hover:underline">{p.nome}</Link>
                          {p.descricao && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{p.descricao}</p>}
                        </td>
                        <td className="p-4"><Badge variant="outline">{p.tipo}</Badge></td>
                        <td className="p-4 text-center"><span className="font-medium">{pessoasCount}</span></td>
                        <td className="p-4 text-center"><span className="font-medium">{apps.length}</span></td>
                        <td className="p-4 text-center"><span className="font-medium">{licCount}</span></td>
                        <td className="p-4 text-center"><span className="font-medium">{grpCount}</span></td>
                        <td className="p-4"><Badge variant={p.ativo ? "default" : "secondary"}>{p.ativo ? "Ativo" : "Inativo"}</Badge></td>
                        <td className="p-4">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={deleting}><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir perfil "{p.nome}"?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta ação removerá o perfil e gerará ações de remoção no Entra ID para todos os colaboradores atribuídos. Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
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

      {/* Dialog Novo/Editar Perfil */}
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
                  {(aplicacoes ?? []).filter((a: any) => !buscaApps || a.nome.toLowerCase().includes(buscaApps.toLowerCase())).sort((a: any, b: any) => (form.aplicacao_ids.includes(a.id) ? 0 : 1) - (form.aplicacao_ids.includes(b.id) ? 0 : 1)).map((a: any) => (
                    <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                      <Checkbox checked={form.aplicacao_ids.includes(a.id)} onCheckedChange={() => toggleItem("aplicacao_ids", a.id)} />
                      <span className="text-sm">{a.nome}</span>
                    </label>
                  ))}
                  {(aplicacoes ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma aplicação cadastrada.</p>}
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
                  {(entraLicencas ?? []).filter((lic: any) => !buscaLicencas || lic.nome.toLowerCase().includes(buscaLicencas.toLowerCase())).sort((a: any, b: any) => (form.licenca_ids.includes(a.id) ? 0 : 1) - (form.licenca_ids.includes(b.id) ? 0 : 1)).map((lic: any) => (
                    <label key={lic.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={form.licenca_ids.includes(lic.id)} onCheckedChange={() => toggleItem("licenca_ids", lic.id)} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{lic.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2">({lic.em_uso}/{lic.total} em uso)</span>
                      </div>
                    </label>
                  ))}
                  {(entraLicencas ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma licença encontrada.</p>}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="grupos" className="mt-4 overflow-auto flex-1">
              <p className="text-xs text-muted-foreground mb-2">Selecione os grupos que os usuários deste perfil receberão.</p>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar grupos..." className="pl-9" value={buscaGrupos} onChange={e => setBuscaGrupos(e.target.value)} />
              </div>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(entraGrupos ?? []).filter((grp: any) => !buscaGrupos || grp.nome.toLowerCase().includes(buscaGrupos.toLowerCase())).sort((a: any, b: any) => (form.grupo_ids.includes(a.id) ? 0 : 1) - (form.grupo_ids.includes(b.id) ? 0 : 1)).map((grp: any) => (
                    <label key={grp.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={form.grupo_ids.includes(grp.id)} onCheckedChange={() => toggleItem("grupo_ids", grp.id)} />
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editingId ? "Atualizar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
