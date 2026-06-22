import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Clock, CheckCircle2, XCircle, Send, FileText, AppWindow, Users, KeyRound, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { sendNotificationEmail } from "@/lib/sendNotificationEmail";
import CatalogResourceList from "./sections/CatalogResourceList";




function extractOwnerEmail(owner: string | null): string | null {
  if (!owner) return null;
  const match = owner.match(/<(.+?)>/);
  const email = match ? match[1] : owner;
  return email.includes("@") ? email : null;
}

export default function PortalSolicitacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [solicitacaoItens, setSolicitacaoItens] = useState<any[]>([]);
  const [aplicacoes, setAplicacoes] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [licencas, setLicencas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([]);
  const [selectedLicencas, setSelectedLicencas] = useState<string[]>([]);
  const [justificativa, setJustificativa] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [buscaApp, setBuscaApp] = useState("");
  const [buscaGrupo, setBuscaGrupo] = useState("");
  const [buscaLicenca, setBuscaLicenca] = useState("");
  // Catalog context: what the user already has + cargo-based recommendations
  const [ownedAppIds, setOwnedAppIds] = useState<Set<string>>(new Set());
  const [ownedGrupoIds, setOwnedGrupoIds] = useState<Set<string>>(new Set());
  const [ownedLicencaIds, setOwnedLicencaIds] = useState<Set<string>>(new Set());
  const [recAppIds, setRecAppIds] = useState<Set<string>>(new Set());
  const [recGrupoIds, setRecGrupoIds] = useState<Set<string>>(new Set());
  const [recLicencaIds, setRecLicencaIds] = useState<Set<string>>(new Set());


  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
      }
    });
  }, []);

  useEffect(() => {
    if (userId) fetchData();
  }, [userId]);

  async function fetchData() {
    setLoading(true);
    const [solRes, appRes, grpRes, licRes, itensRes] = await Promise.all([
      supabase
        .from("solicitacoes_acesso")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false }),
      supabase.from("aplicacoes").select("id, nome, entra_id, default_app_role_id, owner").order("nome"),
      supabase.from("entra_grupos").select("id, nome, entra_id, owner").order("nome"),
      supabase.from("licencas").select("id, nome, owner, aplicacao_id").order("nome"),
      supabase.from("solicitacao_itens").select("*").order("created_at"),
    ]);
    setSolicitacoes(solRes.data ?? []);
    setAplicacoes(appRes.data ?? []);
    setGrupos(grpRes.data ?? []);
    setLicencas(licRes.data ?? []);
    setSolicitacaoItens(itensRes.data ?? []);
    setLoading(false);

    // Catalog context: load owned + recommended resources for the requester
    if (userEmail) {
      void loadCatalogContext(userEmail);
    }
  }

  async function loadCatalogContext(email: string) {
    const { data: colab } = await supabase
      .from("colaboradores")
      .select("id, cargo_id")
      .eq("email", email)
      .maybeSingle();
    if (!colab) return;

    // Effective profile assignments (active)
    const { data: atribs } = await supabase
      .from("perfil_atribuicoes")
      .select("perfil_id")
      .eq("colaborador_id", colab.id)
      .eq("ativo", true);
    const ownedPerfilIds = (atribs ?? []).map((a: any) => a.perfil_id);

    // Recommended profiles by cargo (excluding ones the user already has)
    let recPerfilIds: string[] = [];
    if (colab.cargo_id) {
      const { data: cp } = await supabase
        .from("cargo_perfis")
        .select("perfil_id")
        .eq("cargo_id", colab.cargo_id);
      recPerfilIds = (cp ?? [])
        .map((r: any) => r.perfil_id)
        .filter((pid: string) => !ownedPerfilIds.includes(pid));
    }

    // Resolve resources for owned and recommended sets in parallel
    const resolveResources = async (perfilIds: string[]) => {
      if (perfilIds.length === 0) return { apps: new Set<string>(), grupos: new Set<string>(), licencas: new Set<string>() };
      const [pa, pg, pl] = await Promise.all([
        (supabase as any).from("perfil_aplicacoes").select("aplicacao_id").in("perfil_id", perfilIds),
        (supabase as any).from("perfil_grupos").select("grupo_id").in("perfil_id", perfilIds),
        (supabase as any).from("perfil_licencas").select("licenca_id").in("perfil_id", perfilIds),
      ]);
      return {
        apps: new Set<string>((pa.data ?? []).map((r: any) => r.aplicacao_id)),
        grupos: new Set<string>((pg.data ?? []).map((r: any) => r.grupo_id)),
        licencas: new Set<string>((pl.data ?? []).map((r: any) => r.licenca_id)),
      };
    };

    const [owned, rec] = await Promise.all([
      resolveResources(ownedPerfilIds),
      resolveResources(recPerfilIds),
    ]);

    setOwnedAppIds(owned.apps);
    setOwnedGrupoIds(owned.grupos);
    setOwnedLicencaIds(owned.licencas);
    // Recommended: exclude what the user already has
    setRecAppIds(new Set([...rec.apps].filter(id => !owned.apps.has(id))));
    setRecGrupoIds(new Set([...rec.grupos].filter(id => !owned.grupos.has(id))));
    setRecLicencaIds(new Set([...rec.licencas].filter(id => !owned.licencas.has(id))));
  }


  const appMap = new Map(aplicacoes.map(a => [a.id, a]));
  const grupoMap = new Map(grupos.map(g => [g.id, g]));
  const licencaMap = new Map(licencas.map(l => [l.id, l]));

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pendente: { label: "Pendente", variant: "secondary" },
      em_aprovacao: { label: "Em Aprovação", variant: "outline" },
      aprovada: { label: "Aprovada", variant: "default" },
      rejeitada: { label: "Rejeitada", variant: "destructive" },
    };
    const info = map[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  const toggleItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const renderItemStatusBadges = (solicitacaoId: string) => {
    const items = solicitacaoItens.filter(i => i.solicitacao_id === solicitacaoId);
    if (items.length === 0) return null;

    const iconMap: Record<string, any> = { app: AppWindow, grupo: Users, licenca: KeyRound };
    const statusColors: Record<string, string> = {
      pendente: "border-yellow-500 text-yellow-600",
      aprovado: "border-green-500 text-green-600",
      rejeitado: "border-red-500 text-red-600",
    };

    return (
      <div className="flex flex-wrap gap-1">
        {items.map((item: any) => {
          const Icon = iconMap[item.tipo] || AppWindow;
          return (
            <Badge key={item.id} variant="outline" className={`text-xs ${statusColors[item.status] || ""}`}>
              <Icon className="mr-1 h-3 w-3" />
              {item.recurso_nome}
              {item.status === "aprovado" && <CheckCircle2 className="ml-1 h-3 w-3" />}
              {item.status === "rejeitado" && <XCircle className="ml-1 h-3 w-3" />}
              {item.status === "pendente" && <Clock className="ml-1 h-3 w-3" />}
            </Badge>
          );
        })}
      </div>
    );
  };

  const handleSubmit = async () => {
    if (selectedApps.length === 0 && selectedGrupos.length === 0 && selectedLicencas.length === 0) {
      toast({ title: "Selecione ao menos uma aplicação, grupo ou licença", variant: "destructive" });
      return;
    }
    if (!justificativa.trim()) {
      toast({ title: "Preencha a justificativa", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    let solicitanteId: string | null = null;
    if (userEmail) {
      const { data: colab } = await supabase
        .from("colaboradores")
        .select("id, nome, email, entra_id, sam_account_name")
        .eq("email", userEmail)
        .maybeSingle();
      if (colab) solicitanteId = colab.id;
    }

    if (!solicitanteId) {
      toast({ title: "Erro", description: "Não foi possível encontrar seu cadastro de colaborador.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Build items to determine status
    const itemRecords: any[] = [];
    for (const appId of selectedApps) {
      const app = appMap.get(appId);
      const ownerEmail = extractOwnerEmail(app?.owner);
      itemRecords.push({ tipo: "app", recurso_id: appId, recurso_nome: app?.nome || appId, owner_email: ownerEmail, status: ownerEmail ? "pendente" : "aprovado" });
    }
    for (const grpId of selectedGrupos) {
      const grp = grupoMap.get(grpId);
      const ownerEmail = extractOwnerEmail(grp?.owner);
      itemRecords.push({ tipo: "grupo", recurso_id: grpId, recurso_nome: grp?.nome || grpId, owner_email: ownerEmail, status: ownerEmail ? "pendente" : "aprovado" });
    }
    for (const licId of selectedLicencas) {
      const lic = licencaMap.get(licId);
      const ownerEmail = extractOwnerEmail(lic?.owner);
      itemRecords.push({ tipo: "licenca", recurso_id: licId, recurso_nome: lic?.nome || licId, owner_email: ownerEmail, status: ownerEmail ? "pendente" : "aprovado" });
    }

    const hasPending = itemRecords.some(i => i.status === "pendente");
    const initialStatus = hasPending ? "em_aprovacao" : "aprovada";

    const { data: inserted, error } = await supabase.from("solicitacoes_acesso").insert({
      solicitante_id: solicitanteId,
      perfil_id: null,
      aplicacoes_ids: selectedApps,
      grupos_ids: selectedGrupos,
      licencas_ids: selectedLicencas,
      justificativa: justificativa.trim(),
      status: initialStatus,
      user_id: userId,
    } as any).select("id").single();

    if (error) {
      toast({ title: "Erro ao enviar solicitação", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Insert individual items
    const itemsToInsert = itemRecords.map(i => ({ ...i, solicitacao_id: inserted!.id }));
    await supabase.from("solicitacao_itens").insert(itemsToInsert as any);

    // Auto-provision items without owner
    const { data: colabData } = await supabase.from("colaboradores").select("id, nome, email, entra_id, sam_account_name").eq("id", solicitanteId).maybeSingle();
    const autoApproved = itemRecords.filter(i => i.status === "aprovado");

    if (colabData && autoApproved.length > 0) {
      const targetIdentity = colabData.entra_id || colabData.email || colabData.sam_account_name;
      if (targetIdentity) {
        const queueItems = autoApproved.map(item => {
          const actionMap: Record<string, string> = { app: "assign_app", grupo: "assign_group", licenca: "assign_license" };
          const keyMap: Record<string, { id: string; name: string }> = {
            app: { id: "appId", name: "appName" },
            grupo: { id: "groupId", name: "groupName" },
            licenca: { id: "skuId", name: "licenseName" },
          };
          const keys = keyMap[item.tipo];
          let resourceExternalId = item.recurso_id;
          if (item.tipo === "app") {
            const app = aplicacoes.find((a: any) => a.id === item.recurso_id);
            resourceExternalId = app?.entra_id || item.recurso_id;
          }
          if (item.tipo === "grupo") {
            const grupo = grupos.find((g: any) => g.id === item.recurso_id);
            resourceExternalId = grupo?.entra_id || item.recurso_id;
          }
          if (item.tipo === "licenca") {
            const lic = licencas.find((l: any) => l.id === item.recurso_id);
            resourceExternalId = lic?.sku_id || item.recurso_id;
          }
          const payload: Record<string, any> = { [keys.id]: resourceExternalId, [keys.name]: item.recurso_nome, reason: "solicitacao_acesso" };
          if (item.tipo === "app") {
            const app = aplicacoes.find((a: any) => a.id === item.recurso_id);
            if (app?.default_app_role_id) payload.appRoleId = app.default_app_role_id;
          }
          return {
            action_type: actionMap[item.tipo],
            colaborador_id: colabData.id,
            target_identity: targetIdentity,
            status: "pending",
            payload_json: payload,
            requested_by: userEmail || "portal",
          };
        });
        await supabase.from("iam_queue").insert(queueItems as any);
      }
    }

    // If all auto-approved, mark the request
    if (!hasPending) {
      await supabase.from("solicitacoes_acesso").update({
        aprovador: "auto",
        data_decisao: new Date().toISOString(),
        comentario: "Aprovação automática — nenhum item possui owner definido",
      } as any).eq("id", inserted!.id);
    }

    const colabNome = colabData?.nome || userEmail || "Colaborador";

    // Notify owners grouped by email
    const ownerGroups = new Map<string, string[]>();
    for (const item of itemRecords) {
      if (item.owner_email) {
        const existing = ownerGroups.get(item.owner_email) || [];
        existing.push(item.recurso_nome);
        ownerGroups.set(item.owner_email, existing);
      }
    }

    for (const [ownerEmail, ownerItems] of ownerGroups) {
      sendNotificationEmail("solicitacao_criada", {
        destinatario_email: ownerEmail,
        colaborador_nome: colabNome,
        itens: ownerItems.join(", "),
        justificativa: justificativa.trim(),
        solicitante: colabNome,
      });
    }

    // Fallback: notify admins if no items have owners and there are pending items
    if (ownerGroups.size === 0 && hasPending) {
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (adminRoles && adminRoles.length > 0) {
        const adminIds = adminRoles.map((r: any) => r.user_id);
        const { data: adminProfiles } = await supabase.from("profiles").select("email").in("id", adminIds);
        for (const ap of (adminProfiles || [])) {
          sendNotificationEmail("solicitacao_criada", {
            destinatario_email: ap.email,
            colaborador_nome: colabNome,
            itens: itemRecords.map(i => i.recurso_nome).join(", "),
            justificativa: justificativa.trim(),
            solicitante: colabNome,
          });
        }
      }
    }

    // Notify requester about auto-approved items
    if (autoApproved.length > 0 && colabData?.email) {
      sendNotificationEmail("solicitacao_decidida", {
        destinatario_email: colabData.email,
        colaborador_nome: colabNome,
        itens: autoApproved.map(i => i.recurso_nome).join(", "),
        status: "aprovada",
        aprovador: "Automático",
        comentario: "Aprovação automática — sem owner definido",
      });
    }

    toast({
      title: "Solicitação enviada com sucesso!",
      description: hasPending
        ? `${autoApproved.length} item(ns) aprovado(s) automaticamente, ${itemRecords.length - autoApproved.length} aguardando aprovação.`
        : "Todos os itens foram aprovados automaticamente.",
    });

    setDialogOpen(false);
    setSelectedApps([]);
    setSelectedGrupos([]);
    setSelectedLicencas([]);
    setJustificativa("");
    setBuscaApp("");
    setBuscaGrupo("");
    setBuscaLicenca("");
    fetchData();
    setSubmitting(false);
  };

  const totais = {
    total: solicitacoes.length,
    pendentes: solicitacoes.filter(s => s.status === "pendente" || s.status === "em_aprovacao").length,
    aprovadas: solicitacoes.filter(s => s.status === "aprovada").length,
    rejeitadas: solicitacoes.filter(s => s.status === "rejeitada").length,
  };

  // Sort: recomendado > selecionado > já tem (no fim) > alfabético
  const catalogSort = (selected: string[], owned: Set<string>, rec: Set<string>) =>
    (a: any, b: any) => {
      const score = (x: any) => (selected.includes(x.id) ? 0 : rec.has(x.id) ? 1 : owned.has(x.id) ? 3 : 2);
      const sa = score(a); const sb = score(b);
      return sa - sb || a.nome.localeCompare(b.nome);
    };

  const filteredApps = aplicacoes
    .filter(a => !buscaApp || a.nome.toLowerCase().includes(buscaApp.toLowerCase()))
    .sort(catalogSort(selectedApps, ownedAppIds, recAppIds));

  const filteredGrupos = grupos
    .filter(g => !buscaGrupo || g.nome.toLowerCase().includes(buscaGrupo.toLowerCase()))
    .sort(catalogSort(selectedGrupos, ownedGrupoIds, recGrupoIds));

  const filteredLicencas = licencas
    .filter(l => !buscaLicenca || l.nome.toLowerCase().includes(buscaLicenca.toLowerCase()))
    .sort(catalogSort(selectedLicencas, ownedLicencaIds, recLicencaIds));

  const totalRecomendados = recAppIds.size + recGrupoIds.size + recLicencaIds.size;

  const applyAllRecommendations = () => {
    setSelectedApps(prev => Array.from(new Set([...prev, ...recAppIds])));
    setSelectedGrupos(prev => Array.from(new Set([...prev, ...recGrupoIds])));
    setSelectedLicencas(prev => Array.from(new Set([...prev, ...recLicencaIds])));
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Minhas Solicitações</h1>
          <p className="text-muted-foreground">Acompanhe suas solicitações de acesso</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Solicitação
        </Button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{totais.total}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{totais.pendentes}</p>
              <p className="text-sm text-muted-foreground">Pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{totais.aprovadas}</p>
              <p className="text-sm text-muted-foreground">Aprovadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{totais.rejeitadas}</p>
              <p className="text-sm text-muted-foreground">Rejeitadas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : solicitacoes.length === 0 ? (
            <div className="p-8">
              <Send className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p>Você ainda não possui solicitações.</p>
              <p className="text-sm">Clique em "Nova Solicitação" para começar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Itens Solicitados</TableHead>
                  <TableHead className="hidden md:table-cell">Justificativa</TableHead>
                  <TableHead className="hidden sm:table-cell">Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Comentário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitacoes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium max-w-xs">
                      {renderItemStatusBadges(s.id) || (
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray(s.aplicacoes_ids) ? s.aplicacoes_ids : []).map((id: string) => (
                            <Badge key={id} variant="outline" className="text-xs">
                              <AppWindow className="mr-1 h-3 w-3" />
                              {appMap.get(id)?.nome || id}
                            </Badge>
                          ))}
                          {(Array.isArray(s.grupos_ids) ? s.grupos_ids : []).map((id: string) => (
                            <Badge key={id} variant="secondary" className="text-xs">
                              <Users className="mr-1 h-3 w-3" />
                              {grupoMap.get(id)?.nome || id}
                            </Badge>
                          ))}
                          {(Array.isArray(s.licencas_ids) ? s.licencas_ids : []).map((id: string) => (
                            <Badge key={id} variant="outline" className="text-xs border-primary/40">
                              <KeyRound className="mr-1 h-3 w-3" />
                              {licencaMap.get(id)?.nome || id}
                            </Badge>
                          ))}
                          {!(s.aplicacoes_ids?.length || s.grupos_ids?.length || s.licencas_ids?.length) && (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate hidden md:table-cell">{s.justificativa}</TableCell>
                    <TableCell className="hidden sm:table-cell">{format(new Date(s.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="max-w-xs truncate hidden lg:table-cell">{s.comentario || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Solicitação de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Recomendações por cargo */}
            {totalRecomendados > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Recomendado para o seu cargo</p>
                  <p className="text-xs text-muted-foreground">
                    {totalRecomendados} recurso(s) costumam ser usados por colegas do seu cargo e você ainda não possui.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={applyAllRecommendations}>
                  Selecionar todos
                </Button>
              </div>
            )}

            <CatalogResourceList
              icon={AppWindow}
              label="Aplicações"
              itemLabel="selecionada(s)"
              searchPlaceholder="Buscar aplicação..."
              emptyMessage="Nenhuma aplicação encontrada"
              search={buscaApp}
              onSearchChange={setBuscaApp}
              items={filteredApps}
              selected={selectedApps}
              ownedIds={ownedAppIds}
              recommendedIds={recAppIds}
              onToggle={(id) => toggleItem(selectedApps, setSelectedApps, id)}
            />

            <CatalogResourceList
              icon={Users}
              label="Grupos"
              itemLabel="selecionado(s)"
              searchPlaceholder="Buscar grupo..."
              emptyMessage="Nenhum grupo encontrado"
              search={buscaGrupo}
              onSearchChange={setBuscaGrupo}
              items={filteredGrupos}
              selected={selectedGrupos}
              ownedIds={ownedGrupoIds}
              recommendedIds={recGrupoIds}
              onToggle={(id) => toggleItem(selectedGrupos, setSelectedGrupos, id)}
            />

            <CatalogResourceList
              icon={KeyRound}
              label="Licenças"
              itemLabel="selecionada(s)"
              searchPlaceholder="Buscar licença..."
              emptyMessage="Nenhuma licença encontrada"
              search={buscaLicenca}
              onSearchChange={setBuscaLicenca}
              items={filteredLicencas}
              selected={selectedLicencas}
              ownedIds={ownedLicencaIds}
              recommendedIds={recLicencaIds}
              onToggle={(id) => toggleItem(selectedLicencas, setSelectedLicencas, id)}
            />



            {/* Justificativa */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Justificativa</label>
              <Textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Descreva o motivo da solicitação..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Enviando..." : "Enviar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
