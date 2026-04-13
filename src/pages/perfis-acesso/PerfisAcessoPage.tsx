import { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Pencil, Trash2, Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { usePerfisAcesso, useAplicacoes, useEntraLicencas, useEntraGrupos, useSharepointSites, useAllSharepointPastas } from "@/hooks/useOrigoData";
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
import EmptyState from "@/components/EmptyState";
import SortableHeader, { SortDirection, useSortableData } from "@/components/SortableHeader";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";

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
  const { data: sharepointSites } = useSharepointSites();
  const { data: allPastas } = useAllSharepointPastas();

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
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PerfilForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // SharePoint state for new/edit dialog
  const [spItems, setSpItems] = useState<Array<{ site_id: string; pasta_nivel1_id: string | null; pasta_nivel2_id: string | null; permissao: string }>>([]);
  const [spNewSite, setSpNewSite] = useState("");
  const [spNewPasta1, setSpNewPasta1] = useState("");
  const [spNewPasta2, setSpNewPasta2] = useState("");
  const [spNewPerm, setSpNewPerm] = useState("leitura");
  const [spFolderLoading, setSpFolderLoading] = useState(false);
  const spPastasNivel1 = useMemo(() => (allPastas ?? []).filter((p: any) => p.site_db_id === spNewSite && !p.parent_id), [allPastas, spNewSite]);
  const spPastasNivel2 = useMemo(() => (allPastas ?? []).filter((p: any) => p.parent_id === spNewPasta1), [allPastas, spNewPasta1]);

  const syncFoldersForSite = useCallback(async (siteDbId: string) => {
    // Check if folders already loaded
    const existing = (allPastas ?? []).filter((p: any) => p.site_db_id === siteDbId);
    if (existing.length > 0) return;
    setSpFolderLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-sharepoint-sites`;
      await fetch(url, {
        method: "POST",
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ site_db_id: siteDbId }),
      });
      queryClient.invalidateQueries({ queryKey: ["sharepoint_pastas_all"] });
    } catch { /* ignore */ }
    setSpFolderLoading(false);
  }, [allPastas, queryClient]);

  const allPerfis = perfis ?? [];
  const list = allPerfis.filter((p: any) => {
    if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
    if (filtroStatus === "ativo" && !p.ativo) return false;
    if (filtroStatus === "inativo" && p.ativo) return false;
    return true;
  });
  const sorted = useSortableData(list, sortField, sortDir);
  const { paginatedItems, safePage } = usePagination(sorted, page, pageSize);

  // Header counters
  const totalPerfis = allPerfis.length;
  const ativosPerfis = allPerfis.filter((p: any) => p.ativo).length;
  const privilegiadosPerfis = allPerfis.filter((p: any) => p.tipo === "privilegiado").length;

  const openNew = () => { setForm(emptyForm); setEditingId(null); setBuscaApps(""); setBuscaLicencas(""); setBuscaGrupos(""); setSpItems([]); setSpNewSite(""); setSpNewPasta1(""); setSpNewPasta2(""); setSpNewPerm("leitura"); setDialogOpen(true); };
  const openEdit = async (p: any) => {
    const [appsRes, licsRes, grpsRes, spRes] = await Promise.all([
      (supabase as any).from("perfil_aplicacoes").select("aplicacao_id").eq("perfil_id", p.id),
      (supabase as any).from("perfil_licencas").select("licenca_id").eq("perfil_id", p.id),
      (supabase as any).from("perfil_grupos").select("grupo_id").eq("perfil_id", p.id),
      (supabase as any).from("perfil_sharepoint").select("site_id, pasta_nivel1_id, pasta_nivel2_id, permissao").eq("perfil_id", p.id),
    ]);
    setForm({
      nome: p.nome, descricao: p.descricao || "",
      aplicacao_ids: (appsRes.data ?? []).map((a: any) => a.aplicacao_id),
      licenca_ids: (licsRes.data ?? []).map((l: any) => l.licenca_id),
      grupo_ids: (grpsRes.data ?? []).map((g: any) => g.grupo_id),
      tipo: p.tipo, ativo: p.ativo,
    });
    setSpItems((spRes.data ?? []).map((s: any) => ({ site_id: s.site_id, pasta_nivel1_id: s.pasta_nivel1_id, pasta_nivel2_id: s.pasta_nivel2_id, permissao: s.permissao })));
    setEditingId(p.id);
    setBuscaApps(""); setBuscaLicencas(""); setBuscaGrupos(""); setSpNewSite(""); setSpNewPasta1(""); setSpNewPasta2(""); setSpNewPerm("leitura");
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

      // Save SharePoint permissions
      await (supabase as any).from("perfil_sharepoint").delete().eq("perfil_id", perfilId);
      if (spItems.length > 0) await (supabase as any).from("perfil_sharepoint").insert(spItems.map(sp => ({ perfil_id: perfilId, site_id: sp.site_id, pasta_nivel1_id: sp.pasta_nivel1_id || null, pasta_nivel2_id: sp.pasta_nivel2_id || null, permissao: sp.permissao })));


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
        (supabase as any).from("perfil_sharepoint").delete().eq("perfil_id", perfId),
        (supabase as any).from("cargo_perfis").delete().eq("perfil_id", perfId),
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
        <div data-tour="actions"><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Perfil</Button></div>
      </div>

      {/* Header counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      <div data-tour="search-filter" className="flex gap-2 flex-wrap">
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

      <Card data-tour="table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4"><SortableHeader label="Nome" field="nome" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
                    <th className="p-4 hidden md:table-cell"><SortableHeader label="Tipo" field="tipo" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
                    <th className="p-4 font-medium text-center hidden sm:table-cell">Pessoas</th>
                    <th className="p-4 font-medium text-center hidden sm:table-cell">Apps</th>
                    <th className="p-4 font-medium text-center hidden lg:table-cell">Licenças</th>
                    <th className="p-4 font-medium text-center hidden lg:table-cell">Grupos</th>
                    <th className="p-4"><SortableHeader label="Status" field="ativo" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
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
                        <td className="p-4 hidden md:table-cell"><Badge variant="outline">{p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1)}</Badge></td>
                        <td className="p-4 text-center hidden sm:table-cell"><span className="font-medium">{pessoasCount}</span></td>
                        <td className="p-4 text-center hidden sm:table-cell"><span className="font-medium">{apps.length}</span></td>
                        <td className="p-4 text-center hidden lg:table-cell"><span className="font-medium">{licCount}</span></td>
                        <td className="p-4 text-center hidden lg:table-cell"><span className="font-medium">{grpCount}</span></td>
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
            <TabsList className="w-full justify-start flex-wrap">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="aplicacoes">Aplicações ({form.aplicacao_ids.length})</TabsTrigger>
              <TabsTrigger value="licencas">Licenças ({form.licenca_ids.length})</TabsTrigger>
              <TabsTrigger value="grupos">Grupos ({form.grupo_ids.length})</TabsTrigger>
              <TabsTrigger value="sharepoint">SharePoint ({spItems.length})</TabsTrigger>
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
                  {(aplicacoes ?? []).length === 0 && <EmptyState message="Nenhuma aplicação cadastrada." size="sm" />}
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
                  {(entraLicencas ?? []).length === 0 && <EmptyState message="Nenhuma licença encontrada." size="sm" />}
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
                  {(entraGrupos ?? []).length === 0 && <EmptyState message="Nenhum grupo encontrado." size="sm" />}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sharepoint" className="mt-4 overflow-auto flex-1">
              <p className="text-xs text-muted-foreground mb-2">Defina os sites e pastas do SharePoint que este perfil pode acessar.</p>
              <div className="space-y-3 mb-3 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Site</Label>
                   <Popover open={spSitePopoverOpen} onOpenChange={setSpSitePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-10">
                          {spNewSite ? (sharepointSites ?? []).find((s: any) => s.id === spNewSite)?.nome || "Site" : "Selecione o site"}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar site..." />
                          <CommandList>
                            <CommandEmpty>Nenhum site encontrado.</CommandEmpty>
                            <CommandGroup>
                              {(sharepointSites ?? []).map((s: any) => (
                                <CommandItem key={s.id} value={s.nome} onSelect={() => { setSpNewSite(s.id); setSpNewPasta1(""); setSpNewPasta2(""); syncFoldersForSite(s.id); setSpSitePopoverOpen(false); }}>
                                  {s.nome}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Permissão</Label>
                    <Select value={spNewPerm} onValueChange={setSpNewPerm}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leitura">Leitura</SelectItem>
                        <SelectItem value="escrita">Escrita</SelectItem>
                        <SelectItem value="controle_total">Controle Total</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {spNewSite && (spFolderLoading ? <p className="text-xs text-muted-foreground animate-pulse">Carregando pastas...</p> : spPastasNivel1.length > 0) && !spFolderLoading && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Pasta Nível 1 (opcional)</Label>
                      <Select value={spNewPasta1} onValueChange={v => { setSpNewPasta1(v); setSpNewPasta2(""); }}>
                        <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                        <SelectContent>
                          {spPastasNivel1.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {spNewPasta1 && spPastasNivel2.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Pasta Nível 2 (opcional)</Label>
                        <Select value={spNewPasta2} onValueChange={setSpNewPasta2}>
                          <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            {spPastasNivel2.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                <Button size="sm" disabled={!spNewSite} onClick={() => {
                  setSpItems(prev => [...prev, { site_id: spNewSite, pasta_nivel1_id: spNewPasta1 || null, pasta_nivel2_id: spNewPasta2 || null, permissao: spNewPerm }]);
                  setSpNewSite(""); setSpNewPasta1(""); setSpNewPasta2(""); setSpNewPerm("leitura");
                }}><Plus className="mr-1 h-3 w-3" />Adicionar</Button>
              </div>
              <ScrollArea className="h-48 rounded-md border p-3">
                {spItems.length === 0 ? (
                  <EmptyState message="Nenhuma permissão SharePoint adicionada." size="sm" />
                ) : (
                  <div className="space-y-2">
                    {spItems.map((item, idx) => {
                      const site = (sharepointSites ?? []).find((s: any) => s.id === item.site_id);
                      const p1 = item.pasta_nivel1_id ? (allPastas ?? []).find((p: any) => p.id === item.pasta_nivel1_id) : null;
                      const p2 = item.pasta_nivel2_id ? (allPastas ?? []).find((p: any) => p.id === item.pasta_nivel2_id) : null;
                      const permLabel = item.permissao === "controle_total" ? "Controle Total" : item.permissao.charAt(0).toUpperCase() + item.permissao.slice(1);
                      return (
                        <div key={idx} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1.5 text-sm">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{site?.nome || "Site"}</span>
                            {p1 && <span className="text-muted-foreground"> / {p1.nome}</span>}
                            {p2 && <span className="text-muted-foreground"> / {p2.nome}</span>}
                            <Badge variant="outline" className="ml-2 text-xs">{permLabel}</Badge>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSpItems(prev => prev.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : editingId ? "Atualizar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OnboardingTour pageKey="perfis_acesso" steps={tourSteps.perfis_acesso} />
    </div>
  );
}

