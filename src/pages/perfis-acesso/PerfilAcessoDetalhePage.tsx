import { useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Search, Plus, Trash2 } from "lucide-react";
import { usePerfilAcesso, usePerfilAtribuicoes, useAplicacoes, useEntraLicencas, useEntraGrupos, useSharepointSites, useAllSharepointPastas, usePerfilSharepoint } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { generateEntraQueueForDiff, findAffectedCollaborators } from "@/lib/entraQueueHelper";
import { logAuditoria } from "@/lib/auditLogger";
import EmptyState from "@/components/EmptyState";

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
  cargo: "bg-info/15 text-info border-info/30",
};

export default function PerfilAcessoDetalhePage() {
  const { id } = useParams();
  const { data: perfil, isLoading } = usePerfilAcesso(id);
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
  const { data: cargosVinculados } = useQuery({
    queryKey: ["cargo_perfis_detalhe", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("cargo_perfis").select("*, cargos(id, nome, areas(nome))").eq("perfil_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: sharepointSites } = useSharepointSites();
  const { data: allPastas } = useAllSharepointPastas();
  const { data: perfilSharepoint } = usePerfilSharepoint(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Internal profiles per app
  const { data: allPerfisInternos } = useQuery({
    queryKey: ["all_perfis_internos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("aplicacao_perfis_internos").select("*").eq("ativo", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: perfilAppsInternos } = useQuery({
    queryKey: ["perfil_apps_internos", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("perfil_apps_internos").select("*, aplicacao_perfis_internos(nome_externo)").eq("perfil_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nome: "", descricao: "", tipo: "funcional", ativo: true, aplicacao_ids: [] as string[], licenca_ids: [] as string[], grupo_ids: [] as string[], perfil_interno_map: {} as Record<string, string> });
  const [saving, setSaving] = useState(false);
  const [buscaApps, setBuscaApps] = useState("");
  const [buscaLicencas, setBuscaLicencas] = useState("");
  const [buscaGrupos, setBuscaGrupos] = useState("");

  // SharePoint edit state
  const [spItems, setSpItems] = useState<Array<{ site_id: string; pasta_nivel1_id: string | null; pasta_nivel2_id: string | null; permissao: string }>>([]);
  const [spNewSite, setSpNewSite] = useState("");
  const [spNewPasta1, setSpNewPasta1] = useState("");
  const [spNewPasta2, setSpNewPasta2] = useState("");
  const [spNewPerm, setSpNewPerm] = useState("leitura");
  const [spFolderLoading, setSpFolderLoading] = useState(false);

  // Derive pasta lists for the SP new-item form
  const spPastasNivel1 = useMemo(() => (allPastas ?? []).filter((p: any) => p.site_db_id === spNewSite && !p.parent_id), [allPastas, spNewSite]);
  const spPastasNivel2 = useMemo(() => (allPastas ?? []).filter((p: any) => p.parent_id === spNewPasta1), [allPastas, spNewPasta1]);

  const syncFoldersForSite = useCallback(async (siteDbId: string) => {
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
  const appsWithProfiles = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const pi of (allPerfisInternos || [])) {
      if (!map[pi.aplicacao_id]) map[pi.aplicacao_id] = [];
      map[pi.aplicacao_id].push(pi);
    }
    return map;
  }, [allPerfisInternos]);

  const openEdit = () => {
    if (!perfil) return;
    // Build perfil_interno_map from existing data
    const piMap: Record<string, string> = {};
    for (const pai of (perfilAppsInternos || [])) {
      piMap[pai.aplicacao_id] = pai.perfil_interno_id;
    }
    setEditForm({
      nome: perfil.nome, descricao: perfil.descricao || "", tipo: perfil.tipo, ativo: perfil.ativo,
      aplicacao_ids: (perfilApps ?? []).map((pa: any) => pa.aplicacao_id),
      licenca_ids: (perfilLicencas ?? []).map((pl: any) => pl.licenca_id),
      grupo_ids: (perfilGrupos ?? []).map((pg: any) => pg.grupo_id),
      perfil_interno_map: piMap,
    });
    setBuscaApps("");
    setBuscaLicencas("");
    setBuscaGrupos("");
    // Load existing SharePoint items
    setSpItems((perfilSharepoint ?? []).map((ps: any) => ({ site_id: ps.site_id, pasta_nivel1_id: ps.pasta_nivel1_id || null, pasta_nivel2_id: ps.pasta_nivel2_id || null, permissao: ps.permissao })));
    setSpNewSite(""); setSpNewPasta1(""); setSpNewPasta2(""); setSpNewPerm("leitura");
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

      // Sync perfil_apps_internos (internal profiles per app)
      await (supabase as any).from("perfil_apps_internos").delete().eq("perfil_id", id!);
      const piEntries = Object.entries(editForm.perfil_interno_map).filter(([appId, piId]) => piId && editForm.aplicacao_ids.includes(appId));
      if (piEntries.length > 0) {
        await (supabase as any).from("perfil_apps_internos").insert(piEntries.map(([appId, piId]) => ({ perfil_id: id!, aplicacao_id: appId, perfil_interno_id: piId })));
      }

      // Sync SharePoint permissions
      await (supabase as any).from("perfil_sharepoint").delete().eq("perfil_id", id!);
      if (spItems.length > 0) {
        await (supabase as any).from("perfil_sharepoint").insert(spItems.map(sp => ({ perfil_id: id!, site_id: sp.site_id, pasta_nivel1_id: sp.pasta_nivel1_id || null, pasta_nivel2_id: sp.pasta_nivel2_id || null, permissao: sp.permissao })));
      }

      await logAuditoria({ acao: "editar_perfil", entidade: "perfis_acesso", entidade_id: id!, resumo: `Editado: ${editForm.nome}` });
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
          const affectedColabs = await findAffectedCollaborators(id!);
          if (affectedColabs.length > 0) {
            const queued = await generateEntraQueueForDiff(affectedColabs, {
              addedGrupoIds: addedGrupos, removedGrupoIds: removedGrupos,
              addedLicencaIds: addedLicencas, removedLicencaIds: removedLicencas,
              addedAppIds: addedApps, removedAppIds: removedApps,
            }, { triggerImmediately: false });
            if (queued > 0) toast({ title: `${queued} ação(ões) gerada(s) para o Entra ID` });
          }
        } catch (err) { console.error("Queue insert error:", err); }
      }

      queryClient.invalidateQueries({ queryKey: ["perfil_acesso", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_aplicacoes", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_licencas", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_grupos", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_apps_internos", id] });
      queryClient.invalidateQueries({ queryKey: ["perfil_sharepoint", id] });
      setEditOpen(false);
      triggerEntraProcessing();
    } catch (err: any) { toast({ title: "Erro", description: err.message, variant: "destructive" }); }
    setSaving(false);
  };

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!perfil) return <div className="p-8 text-center text-muted-foreground">Perfil não encontrado.</div>;

  const appNames = (perfilApps ?? []).map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
  const licNames = (perfilLicencas ?? []).map((pl: any) => pl.entra_licencas).filter(Boolean);
  const grpNames = (perfilGrupos ?? []).map((pg: any) => pg.entra_grupos).filter(Boolean);
  const cargos = (cargosVinculados ?? []).map((cp: any) => cp.cargos).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/perfis-acesso"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
            <Badge variant="outline">{perfil.tipo.charAt(0).toUpperCase() + perfil.tipo.slice(1)}</Badge>
            <Badge variant={perfil.ativo ? "default" : "secondary"}>{perfil.ativo ? "Ativo" : "Inativo"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{perfil.descricao || "Sem descrição"}</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
      </div>

      <div className="grid grid-cols-6 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Aplicações</p><p className="text-lg font-semibold">{appNames.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Licenças</p><p className="text-lg font-semibold">{licNames.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Grupos</p><p className="text-lg font-semibold">{grpNames.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">SharePoint</p><p className="text-lg font-semibold">{(perfilSharepoint ?? []).length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Cargos</p><p className="text-lg font-semibold">{cargos.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pessoas</p><p className="text-lg font-semibold">{atribuicoes?.length ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="aplicacoes">
        <TabsList>
          <TabsTrigger value="aplicacoes">Aplicações ({appNames.length})</TabsTrigger>
          <TabsTrigger value="licencas">Licenças ({licNames.length})</TabsTrigger>
          <TabsTrigger value="grupos">Grupos ({grpNames.length})</TabsTrigger>
          <TabsTrigger value="sharepoint">SharePoint ({(perfilSharepoint ?? []).length})</TabsTrigger>
          <TabsTrigger value="cargos">Cargos ({cargos.length})</TabsTrigger>
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
                {appNames.length === 0 && <tr><td><EmptyState message="Nenhuma aplicação vinculada." /></td></tr>}
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
                {licNames.length === 0 && <tr><td colSpan={3}><EmptyState message="Nenhuma licença vinculada." /></td></tr>}
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
                {grpNames.length === 0 && <tr><td colSpan={2}><EmptyState message="Nenhum grupo vinculado." /></td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sharepoint" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Site</th>
                <th className="p-4 font-medium">Pasta Nível 1</th>
                <th className="p-4 font-medium">Pasta Nível 2</th>
                <th className="p-4 font-medium">Permissão</th>
              </tr></thead>
              <tbody>
                {(perfilSharepoint ?? []).map((ps: any, i: number) => {
                  const pastaN1 = ps.pasta_nivel1_id ? (allPastas ?? []).find((p: any) => p.id === ps.pasta_nivel1_id) : null;
                  const pastaN2 = ps.pasta_nivel2_id ? (allPastas ?? []).find((p: any) => p.id === ps.pasta_nivel2_id) : null;
                  const permLabel = ps.permissao === "leitura" ? "Leitura" : ps.permissao === "escrita" ? "Escrita" : "Controle Total";
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-4 font-medium">{ps.sharepoint_sites?.nome || "—"}</td>
                      <td className="p-4 text-muted-foreground">{pastaN1?.nome || "— (Site inteiro)"}</td>
                      <td className="p-4 text-muted-foreground">{pastaN2?.nome || "—"}</td>
                      <td className="p-4"><Badge variant="outline">{permLabel}</Badge></td>
                    </tr>
                  );
                })}
                {(perfilSharepoint ?? []).length === 0 && <tr><td colSpan={4}><EmptyState message="Nenhuma permissão SharePoint vinculada." /></td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="cargos" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Cargo</th>
                <th className="p-4 font-medium">Área</th>
              </tr></thead>
              <tbody>
                {cargos.map((cargo: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-4 font-medium text-primary">
                      <Link to="/configuracoes/cargos" className="hover:underline">{cargo.nome}</Link>
                    </td>
                    <td className="p-4 text-muted-foreground">{cargo.areas?.nome || "—"}</td>
                  </tr>
                ))}
                {cargos.length === 0 && <tr><td colSpan={2}><EmptyState message="Nenhum cargo vinculado a este perfil." /></td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pessoas" className="mt-4">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground">
                <th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Cargo</th><th className="p-4 font-medium">Área</th><th className="p-4 font-medium">Origem</th>
              </tr></thead>
              <tbody>
                {(atribuicoes ?? []).map((a: any) => {
                  const colabId = a.colaborador_id;
                  const colabNome = (a.colaboradores as any)?.nome || "—";
                  return (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-4 font-medium text-primary">
                        {colabId ? <Link to={`/colaboradores/${colabId}`} className="hover:underline">{colabNome}</Link> : colabNome}
                      </td>
                      <td className="p-4 text-muted-foreground">{(a.colaboradores as any)?.cargos?.nome || "—"}</td>
                      <td className="p-4 text-muted-foreground">{(a.colaboradores as any)?.areas?.nome || "—"}</td>
                      <td className="p-4"><Badge variant="outline" className={origemColors[a.origem || "manual"]}>{a.origem === "regra" ? "Regra" : a.origem === "excecao" ? "Exceção" : a.origem === "cargo" ? "Cargo" : "Manual"}</Badge></td>
                    </tr>
                  );
                })}
                {(atribuicoes ?? []).length === 0 && <tr><td colSpan={4}><EmptyState message="Nenhuma pessoa atribuída." /></td></tr>}
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
              <TabsTrigger value="sharepoint">SharePoint ({spItems.length})</TabsTrigger>
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
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar aplicações..." className="pl-9" value={buscaApps} onChange={e => setBuscaApps(e.target.value)} />
              </div>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(aplicacoes ?? []).filter((a: any) => !buscaApps || a.nome.toLowerCase().includes(buscaApps.toLowerCase())).sort((a: any, b: any) => (editForm.aplicacao_ids.includes(a.id) ? 0 : 1) - (editForm.aplicacao_ids.includes(b.id) ? 0 : 1)).map((a: any) => {
                    const appProfiles = appsWithProfiles[a.id] || [];
                    const isChecked = editForm.aplicacao_ids.includes(a.id);
                    return (
                      <div key={a.id} className="space-y-1">
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                          <Checkbox checked={isChecked} onCheckedChange={() => toggleItem("aplicacao_ids", a.id)} />
                          <span className="text-sm">{a.nome}</span>
                          {appProfiles.length > 0 && <Badge variant="outline" className="text-xs ml-auto">{appProfiles.length} perfis</Badge>}
                        </label>
                        {isChecked && appProfiles.length > 0 && (
                          <div className="ml-8">
                            <Select
                              value={editForm.perfil_interno_map[a.id] || ""}
                              onValueChange={v => setEditForm(prev => ({ ...prev, perfil_interno_map: { ...prev.perfil_interno_map, [a.id]: v } }))}
                            >
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione perfil interno..." /></SelectTrigger>
                              <SelectContent>
                                {appProfiles.map((pi: any) => (
                                  <SelectItem key={pi.id} value={pi.id}>{pi.nome_externo}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="licencas" className="mt-4 overflow-auto flex-1">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar licenças..." className="pl-9" value={buscaLicencas} onChange={e => setBuscaLicencas(e.target.value)} />
              </div>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(entraLicencas ?? []).filter((lic: any) => !buscaLicencas || lic.nome.toLowerCase().includes(buscaLicencas.toLowerCase())).sort((a: any, b: any) => (editForm.licenca_ids.includes(a.id) ? 0 : 1) - (editForm.licenca_ids.includes(b.id) ? 0 : 1)).map((lic: any) => (
                    <label key={lic.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={editForm.licenca_ids.includes(lic.id)} onCheckedChange={() => toggleItem("licenca_ids", lic.id)} />
                      <span className="text-sm font-medium">{lic.nome}</span>
                      <span className="text-xs text-muted-foreground">({lic.em_uso}/{lic.total})</span>
                    </label>
                  ))}
                  {(entraLicencas ?? []).length === 0 && <EmptyState message="Nenhuma licença encontrada." size="sm" />}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="grupos" className="mt-4 overflow-auto flex-1">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar grupos..." className="pl-9" value={buscaGrupos} onChange={e => setBuscaGrupos(e.target.value)} />
              </div>
              <ScrollArea className="h-64 rounded-md border p-3">
                <div className="space-y-2">
                  {(entraGrupos ?? []).filter((grp: any) => !buscaGrupos || grp.nome.toLowerCase().includes(buscaGrupos.toLowerCase())).sort((a: any, b: any) => (editForm.grupo_ids.includes(a.id) ? 0 : 1) - (editForm.grupo_ids.includes(b.id) ? 0 : 1)).map((grp: any) => (
                    <label key={grp.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox checked={editForm.grupo_ids.includes(grp.id)} onCheckedChange={() => toggleItem("grupo_ids", grp.id)} />
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

            <TabsContent value="sharepoint" className="mt-4 overflow-auto flex-1 space-y-4">
              {/* Existing items */}
              {spItems.length > 0 && (
                <div className="space-y-2">
                  {spItems.map((item, idx) => {
                    const site = (sharepointSites ?? []).find((s: any) => s.id === item.site_id);
                    const p1 = item.pasta_nivel1_id ? (allPastas ?? []).find((p: any) => p.id === item.pasta_nivel1_id) : null;
                    const p2 = item.pasta_nivel2_id ? (allPastas ?? []).find((p: any) => p.id === item.pasta_nivel2_id) : null;
                    const permLabel = item.permissao === "leitura" ? "Leitura" : item.permissao === "escrita" ? "Escrita" : "Controle Total";
                    return (
                      <div key={idx} className="flex items-center gap-2 text-sm border rounded-md px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{site?.nome || "?"}</span>
                          {p1 && <span className="text-muted-foreground"> › {p1.nome}</span>}
                          {p2 && <span className="text-muted-foreground"> › {p2.nome}</span>}
                        </div>
                        <Badge variant="outline">{permLabel}</Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSpItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add new item form */}
              <div className="space-y-3 border rounded-md p-3">
                <p className="text-xs font-medium text-muted-foreground">Adicionar permissão</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Site</Label>
                    <Select value={spNewSite} onValueChange={v => { setSpNewSite(v); setSpNewPasta1(""); setSpNewPasta2(""); syncFoldersForSite(v); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {(sharepointSites ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Permissão</Label>
                    <Select value={spNewPerm} onValueChange={setSpNewPerm}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leitura">Leitura</SelectItem>
                        <SelectItem value="escrita">Escrita</SelectItem>
                        <SelectItem value="controle_total">Controle Total</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {spNewSite && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Pasta Nível 1 (opcional)</Label>
                      <Select value={spNewPasta1} onValueChange={v => { setSpNewPasta1(v); setSpNewPasta2(""); }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Site inteiro" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Site inteiro —</SelectItem>
                          {spPastasNivel1.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {spNewPasta1 && spNewPasta1 !== "__none__" && spPastasNivel2.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Pasta Nível 2 (opcional)</Label>
                        <Select value={spNewPasta2} onValueChange={setSpNewPasta2}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pasta inteira" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Pasta inteira —</SelectItem>
                            {spPastasNivel2.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                <Button size="sm" variant="outline" disabled={!spNewSite} onClick={() => {
                  setSpItems(prev => [...prev, { site_id: spNewSite, pasta_nivel1_id: (spNewPasta1 && spNewPasta1 !== "__none__") ? spNewPasta1 : null, pasta_nivel2_id: (spNewPasta2 && spNewPasta2 !== "__none__") ? spNewPasta2 : null, permissao: spNewPerm }]);
                  setSpNewSite(""); setSpNewPasta1(""); setSpNewPasta2(""); setSpNewPerm("leitura");
                }}><Plus className="mr-1 h-3 w-3" />Adicionar</Button>
              </div>
              {(sharepointSites ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum site SharePoint sincronizado. Vá em Configurações → Integrações para sincronizar.</p>}
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Salvando..." : "Atualizar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

