import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import { useAuth } from "@/contexts/AuthContext";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { HandHelping, Plus, Search, Clock, CheckCircle2, XCircle, Send, ExternalLink, AppWindow, Users, KeyRound } from "lucide-react";
import { sendNotificationEmail } from "@/lib/sendNotificationEmail";
import EmptyState from "@/components/EmptyState";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";

function extractOwnerEmail(owner: string | null): string | null {
  if (!owner) return null;
  const match = owner.match(/<(.+?)>/);
  const email = match ? match[1] : owner;
  return email.includes("@") ? email : null;
}

export default function SolicitacoesPage() {
  const { profile } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [solicitacaoItens, setSolicitacaoItens] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [aplicacoes, setAplicacoes] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [licencas, setLicencas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<any>(null);
  const [decisionItens, setDecisionItens] = useState<any[]>([]);
  const [busca, setBusca] = useState("");

  // form
  const [solicitanteId, setSolicitanteId] = useState("");
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([]);
  const [selectedLicencas, setSelectedLicencas] = useState<string[]>([]);
  const [justificativa, setJustificativa] = useState("");
  const [buscaColab, setBuscaColab] = useState("");
  const [buscaApp, setBuscaApp] = useState("");
  const [buscaGrupo, setBuscaGrupo] = useState("");
  const [buscaLicenca, setBuscaLicenca] = useState("");

  // decision
  const [comentario, setComentario] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: s }, { data: c }, { data: apps }, { data: grps }, { data: lics }, { data: itens }] = await Promise.all([
      supabase.from("solicitacoes_acesso").select("*").order("created_at", { ascending: false }),
      supabase.from("colaboradores").select("id, nome, email, sam_account_name, entra_id").eq("status", "ativo").order("nome"),
      supabase.from("aplicacoes").select("id, nome, entra_id, default_app_role_id, owner").order("nome"),
      supabase.from("entra_grupos").select("id, nome, entra_id, owner").order("nome"),
      supabase.from("licencas").select("id, nome, owner, aplicacao_id").order("nome"),
      supabase.from("solicitacao_itens").select("*").order("created_at"),
    ]);
    setSolicitacoes(s || []);
    setColaboradores(c || []);
    setAplicacoes(apps || []);
    setGrupos(grps || []);
    setLicencas(lics || []);
    setSolicitacaoItens(itens || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const colabMap = new Map(colaboradores.map(c => [c.id, c]));
  const appMap = new Map(aplicacoes.map(a => [a.id, a]));
  const grupoMap = new Map(grupos.map(g => [g.id, g]));
  const licencaMap = new Map(licencas.map(l => [l.id, l]));

  const getItensSolicitados = (s: any) => {
    const appIds = Array.isArray(s.aplicacoes_ids) ? s.aplicacoes_ids : [];
    const grpIds = Array.isArray(s.grupos_ids) ? s.grupos_ids : [];
    const licIds = Array.isArray(s.licencas_ids) ? s.licencas_ids : [];
    const items: string[] = [];
    appIds.forEach((id: string) => items.push(appMap.get(id)?.nome || id));
    grpIds.forEach((id: string) => items.push(grupoMap.get(id)?.nome || id));
    licIds.forEach((id: string) => items.push(licencaMap.get(id)?.nome || id));
    if (items.length === 0 && s.perfil_id) return "Perfil de acesso";
    return items.join(", ") || "—";
  };

  const renderItensBadges = (s: any) => {
    const appIds = Array.isArray(s.aplicacoes_ids) ? s.aplicacoes_ids : [];
    const grpIds = Array.isArray(s.grupos_ids) ? s.grupos_ids : [];
    const licIds = Array.isArray(s.licencas_ids) ? s.licencas_ids : [];
    if (appIds.length === 0 && grpIds.length === 0 && licIds.length === 0) {
      return <span className="text-muted-foreground">—</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {appIds.map((id: string) => (
          <Badge key={id} variant="outline" className="text-xs">
            <AppWindow className="mr-1 h-3 w-3" />{appMap.get(id)?.nome || id}
          </Badge>
        ))}
        {grpIds.map((id: string) => (
          <Badge key={id} variant="secondary" className="text-xs">
            <Users className="mr-1 h-3 w-3" />{grupoMap.get(id)?.nome || id}
          </Badge>
        ))}
        {licIds.map((id: string) => (
          <Badge key={id} variant="outline" className="text-xs border-primary/40">
            <KeyRound className="mr-1 h-3 w-3" />{licencaMap.get(id)?.nome || id}
          </Badge>
        ))}
      </div>
    );
  };

  const toggleItem = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Build item records with owner resolution
  const buildItensRecords = (solicitacaoId: string) => {
    const records: any[] = [];
    for (const appId of selectedApps) {
      const app = appMap.get(appId);
      const ownerEmail = extractOwnerEmail(app?.owner);
      records.push({
        solicitacao_id: solicitacaoId,
        tipo: "app",
        recurso_id: appId,
        recurso_nome: app?.nome || appId,
        owner_email: ownerEmail,
        status: ownerEmail ? "pendente" : "aprovado",
      });
    }
    for (const grpId of selectedGrupos) {
      const grp = grupoMap.get(grpId);
      const ownerEmail = extractOwnerEmail(grp?.owner);
      records.push({
        solicitacao_id: solicitacaoId,
        tipo: "grupo",
        recurso_id: grpId,
        recurso_nome: grp?.nome || grpId,
        owner_email: ownerEmail,
        status: ownerEmail ? "pendente" : "aprovado",
      });
    }
    for (const licId of selectedLicencas) {
      const lic = licencaMap.get(licId);
      const ownerEmail = extractOwnerEmail(lic?.owner);
      records.push({
        solicitacao_id: solicitacaoId,
        tipo: "licenca",
        recurso_id: licId,
        recurso_nome: lic?.nome || licId,
        owner_email: ownerEmail,
        status: ownerEmail ? "pendente" : "aprovado",
      });
    }
    return records;
  };

  const provisionItem = async (item: { tipo: string; recurso_id: string; recurso_nome: string }, colab: any) => {
    const targetIdentity = colab.entra_id || colab.email || colab.sam_account_name;
    if (!targetIdentity) return;

    const actionMap: Record<string, string> = { app: "assign_app", grupo: "assign_group", licenca: "assign_license" };
    const payloadKeyMap: Record<string, { idKey: string; nameKey: string }> = {
      app: { idKey: "appId", nameKey: "appName" },
      grupo: { idKey: "groupId", nameKey: "groupName" },
      licenca: { idKey: "skuId", nameKey: "licenseName" },
    };

    const keys = payloadKeyMap[item.tipo];
    let resourceExternalId = item.recurso_id;
    if (item.tipo === "app") resourceExternalId = appMap.get(item.recurso_id)?.entra_id || item.recurso_id;
    if (item.tipo === "grupo") resourceExternalId = grupoMap.get(item.recurso_id)?.entra_id || item.recurso_id;
    if (item.tipo === "licenca") {
      const lic = licencaMap.get(item.recurso_id);
      resourceExternalId = lic?.sku_id || item.recurso_id;
    }

    await supabase.from("iam_queue").insert({
      action_type: actionMap[item.tipo],
      colaborador_id: colab.id,
      target_identity: targetIdentity,
      status: "pending",
      payload_json: {
        [keys.idKey]: resourceExternalId,
        [keys.nameKey]: item.recurso_nome,
        reason: "solicitacao_acesso",
      },
      requested_by: profile?.email || "sistema",
    } as any);
  };

  const handleSubmit = async () => {
    if (!solicitanteId) {
      toast({ title: "Selecione o colaborador", variant: "destructive" });
      return;
    }
    if (selectedApps.length === 0 && selectedGrupos.length === 0 && selectedLicencas.length === 0) {
      toast({ title: "Selecione ao menos uma aplicação, grupo ou licença", variant: "destructive" });
      return;
    }
    if (!justificativa.trim()) {
      toast({ title: "Preencha a justificativa", variant: "destructive" });
      return;
    }

    // Build items first to determine initial status
    const tempItems = buildItensRecords("temp");
    const hasPending = tempItems.some(i => i.status === "pendente");
    const initialStatus = hasPending ? "em_aprovacao" : "aprovada";

    const { data: inserted, error } = await supabase.from("solicitacoes_acesso").insert({
      solicitante_id: solicitanteId,
      aplicacoes_ids: selectedApps,
      grupos_ids: selectedGrupos,
      licencas_ids: selectedLicencas,
      justificativa: justificativa.trim(),
      status: initialStatus,
    } as any).select("id").single();

    if (error) {
      toast({ title: "Erro ao criar solicitação", description: error.message, variant: "destructive" });
      return;
    }

    // Insert individual items
    const itemRecords = buildItensRecords(inserted!.id);
    await supabase.from("solicitacao_itens").insert(itemRecords as any);

    // Auto-provision items without owner
    const colab = colabMap.get(solicitanteId);
    const autoApproved = itemRecords.filter(i => i.status === "aprovado");
    if (colab && autoApproved.length > 0) {
      for (const item of autoApproved) {
        await provisionItem(item, colab);
      }
      triggerEntraProcessing();
    }

    // If all items auto-approved, mark as approved with auto-approval
    if (!hasPending) {
      await supabase.from("solicitacoes_acesso").update({
        status: "aprovada",
        aprovador: "auto",
        data_decisao: new Date().toISOString(),
        comentario: "Aprovação automática — nenhum item possui owner definido",
      } as any).eq("id", inserted!.id);
    }

    const colabNome = colabMap.get(solicitanteId)?.nome || "—";
    const allItemNames = itemRecords.map(i => i.recurso_nome);
    const itensDesc = allItemNames.join(", ");

    await logAuditoria({
      acao: "criar",
      entidade: "solicitacao_acesso",
      entidade_id: inserted?.id,
      resumo: `Solicitação de acesso: ${colabNome} → ${itensDesc}`,
      operador: profile?.email || "sistema",
    });

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
        solicitante: profile?.nome || profile?.email || "Sistema",
      });
    }

    // Notify admins only if NO items have owners
    if (ownerGroups.size === 0 && hasPending) {
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (adminRoles && adminRoles.length > 0) {
        const adminIds = adminRoles.map((r: any) => r.user_id);
        const { data: adminProfiles } = await supabase.from("profiles").select("email").in("id", adminIds);
        for (const ap of (adminProfiles || [])) {
          sendNotificationEmail("solicitacao_criada", {
            destinatario_email: ap.email,
            colaborador_nome: colabNome,
            itens: itensDesc,
            justificativa: justificativa.trim(),
            solicitante: profile?.nome || profile?.email || "Sistema",
          });
        }
      }
    }

    // Notify requester about auto-approved items
    if (autoApproved.length > 0) {
      const solicitanteEmail = colab?.email;
      if (solicitanteEmail) {
        sendNotificationEmail("solicitacao_decidida", {
          destinatario_email: solicitanteEmail,
          colaborador_nome: colabNome,
          itens: autoApproved.map(i => i.recurso_nome).join(", "),
          status: "aprovada",
          aprovador: "Automático",
          comentario: "Aprovação automática — sem owner definido",
        });
      }
    }

    toast({
      title: "Solicitação criada com sucesso",
      description: hasPending
        ? `${autoApproved.length} item(ns) aprovado(s) automaticamente, ${itemRecords.length - autoApproved.length} aguardando aprovação do owner.`
        : "Todos os itens foram aprovados automaticamente.",
    });

    setDialogOpen(false);
    setSolicitanteId("");
    setSelectedApps([]);
    setSelectedGrupos([]);
    setSelectedLicencas([]);
    setJustificativa("");
    setBuscaColab("");
    setBuscaApp("");
    setBuscaGrupo("");
    setBuscaLicenca("");
    fetchData();
  };

  const openDecisionDialog = async (s: any) => {
    // Load items for this request
    const { data: itens } = await supabase
      .from("solicitacao_itens")
      .select("*")
      .eq("solicitacao_id", s.id)
      .eq("status", "pendente")
      .order("created_at");
    setDecisionItens(itens || []);
    setDecisionDialog(s);
  };

  const handleDecision = async (decisao: "aprovada" | "rejeitada") => {
    if (!decisionDialog || decisionItens.length === 0) return;

    const colab = colabMap.get(decisionDialog.solicitante_id);
    const colabNome = colab?.nome || "—";

    // Update all pending items
    const itemIds = decisionItens.map(i => i.id);
    await supabase.from("solicitacao_itens").update({
      status: decisao === "aprovada" ? "aprovado" : "rejeitado",
      decidido_por: profile?.email || "sistema",
      decidido_em: new Date().toISOString(),
    } as any).in("id", itemIds);

    // Provision approved items
    if (decisao === "aprovada" && colab) {
      for (const item of decisionItens) {
        await provisionItem(item, colab);
      }
      triggerEntraProcessing();
    }

    // Check if all items are now decided
    const { data: allItens } = await supabase
      .from("solicitacao_itens")
      .select("status")
      .eq("solicitacao_id", decisionDialog.id);

    const allDecided = (allItens || []).every((i: any) => i.status !== "pendente");
    if (allDecided) {
      const hasRejected = (allItens || []).some((i: any) => i.status === "rejeitado");
      const hasApproved = (allItens || []).some((i: any) => i.status === "aprovado");
      let finalStatus = "aprovada";
      if (hasRejected && !hasApproved) finalStatus = "rejeitada";
      else if (hasRejected && hasApproved) finalStatus = "aprovada"; // partial

      await supabase.from("solicitacoes_acesso").update({
        status: finalStatus,
        aprovador: profile?.email || "sistema",
        comentario: comentario || null,
        data_decisao: new Date().toISOString(),
      } as any).eq("id", decisionDialog.id);
    }

    // Notify requester
    const solicitanteEmail = colab?.email;
    if (solicitanteEmail) {
      const itensNomes = decisionItens.map(i => i.recurso_nome).join(", ");
      sendNotificationEmail("solicitacao_decidida", {
        destinatario_email: solicitanteEmail,
        colaborador_nome: colabNome,
        itens: itensNomes,
        status: decisao,
        aprovador: profile?.nome || profile?.email || "Sistema",
        comentario: comentario || undefined,
      });
    }

    await logAuditoria({
      acao: decisao === "aprovada" ? "aprovar" : "rejeitar",
      entidade: "solicitacao_acesso",
      entidade_id: decisionDialog.id,
      resumo: `Itens ${decisao === "aprovada" ? "aprovados" : "rejeitados"}: ${decisionItens.map(i => i.recurso_nome).join(", ")}`,
      operador: profile?.email || "sistema",
      detalhes: { comentario },
    });

    toast({ title: `Itens ${decisao === "aprovada" ? "aprovados" : "rejeitados"} com sucesso` });

    setDecisionDialog(null);
    setDecisionItens([]);
    setComentario("");
    fetchData();
  };

  const getItemStatusForSolicitacao = (solicitacaoId: string) => {
    return solicitacaoItens.filter(i => i.solicitacao_id === solicitacaoId);
  };

  const renderItemStatusBadges = (solicitacaoId: string) => {
    const items = getItemStatusForSolicitacao(solicitacaoId);
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

  const pendentes = solicitacoes.filter(s => s.status === "pendente" || s.status === "em_aprovacao");
  const decididas = solicitacoes.filter(s => s.status === "aprovada" || s.status === "rejeitada");

  const filtered = (list: any[]) => list.filter(s => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    const cNome = colabMap.get(s.solicitante_id)?.nome?.toLowerCase() || "";
    const itens = getItensSolicitados(s).toLowerCase();
    return cNome.includes(q) || itens.includes(q) || (s.justificativa || "").toLowerCase().includes(q);
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "pendente": return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
      case "em_aprovacao": return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="mr-1 h-3 w-3" />Em Aprovação</Badge>;
      case "aprovada": return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Aprovada</Badge>;
      case "rejeitada": return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejeitada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredColabs = colaboradores.filter(c => !buscaColab || c.nome.toLowerCase().includes(buscaColab.toLowerCase()));

  const filteredApps = aplicacoes
    .filter(a => !buscaApp || a.nome.toLowerCase().includes(buscaApp.toLowerCase()))
    .sort((a, b) => {
      const aS = selectedApps.includes(a.id) ? 0 : 1;
      const bS = selectedApps.includes(b.id) ? 0 : 1;
      return aS - bS || a.nome.localeCompare(b.nome);
    });

  const filteredGrupos = grupos
    .filter(g => !buscaGrupo || g.nome.toLowerCase().includes(buscaGrupo.toLowerCase()))
    .sort((a, b) => {
      const aS = selectedGrupos.includes(a.id) ? 0 : 1;
      const bS = selectedGrupos.includes(b.id) ? 0 : 1;
      return aS - bS || a.nome.localeCompare(b.nome);
    });

  const filteredLicencas = licencas
    .filter(l => !buscaLicenca || l.nome.toLowerCase().includes(buscaLicenca.toLowerCase()))
    .sort((a, b) => {
      const aS = selectedLicencas.includes(a.id) ? 0 : 1;
      const bS = selectedLicencas.includes(b.id) ? 0 : 1;
      return aS - bS || a.nome.localeCompare(b.nome);
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Solicitações de Acesso</h1>
          <p className="text-muted-foreground">Self-Service — solicite e gerencie acessos</p>
        </div>
        <div data-tour="actions" className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href="/portal" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />Portal Externo
            </a>
          </Button>
          <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova Solicitação</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <HandHelping className="h-8 w-8 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{solicitacoes.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-yellow-500" />
          <div><p className="text-2xl font-bold">{pendentes.length}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <div><p className="text-2xl font-bold">{decididas.length}</p><p className="text-xs text-muted-foreground">Decididas</p></div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar solicitações..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
      </div>

      <Tabs data-tour="tabs" defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({decididas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes">
          <Card data-tour="table">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Solicitante</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead className="hidden md:table-cell">Justificativa</TableHead>
                <TableHead className="hidden sm:table-cell">Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered(pendentes).length === 0 ? (
                  <TableRow><TableCell colSpan={6}><EmptyState message="Nenhuma solicitação pendente" /></TableCell></TableRow>
                ) : filtered(pendentes).map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{colabMap.get(s.solicitante_id)?.nome || "—"}</TableCell>
                    <TableCell className="max-w-[300px]">{renderItemStatusBadges(s.id) || renderItensBadges(s)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground hidden md:table-cell">{s.justificativa}</TableCell>
                    <TableCell className="hidden sm:table-cell">{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="text-green-600" onClick={() => openDecisionDialog(s)}>Decidir</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Solicitante</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Aprovador</TableHead>
                <TableHead className="hidden lg:table-cell">Comentário</TableHead>
                <TableHead className="hidden sm:table-cell">Decisão em</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered(decididas).length === 0 ? (
                  <TableRow><TableCell colSpan={6}><EmptyState message="Nenhum histórico" /></TableCell></TableRow>
                ) : filtered(decididas).map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{colabMap.get(s.solicitante_id)?.nome || "—"}</TableCell>
                    <TableCell className="max-w-[300px]">{renderItemStatusBadges(s.id) || renderItensBadges(s)}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.aprovador || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground hidden lg:table-cell">{s.comentario || "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{s.data_decisao ? new Date(s.data_decisao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Nova Solicitação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Solicitação de Acesso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Colaborador */}
            <div>
              <label className="text-sm font-medium">Colaborador</label>
              <Input placeholder="Buscar colaborador..." value={buscaColab} onChange={e => setBuscaColab(e.target.value)} className="mb-2" />
              <Select value={solicitanteId} onValueChange={setSolicitanteId}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {filteredColabs.slice(0, 50).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}{c.email ? ` (${c.email})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Aplicações */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <AppWindow className="h-4 w-4" /> Aplicações
                {selectedApps.length > 0 && <Badge variant="secondary" className="text-xs">{selectedApps.length} selecionada(s)</Badge>}
              </label>
              <Input placeholder="Buscar aplicação..." value={buscaApp} onChange={e => setBuscaApp(e.target.value)} />
              <ScrollArea className="h-36 rounded-md border p-2">
                {filteredApps.map(a => (
                  <label key={a.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
                    <Checkbox checked={selectedApps.includes(a.id)} onCheckedChange={() => toggleItem(selectedApps, setSelectedApps, a.id)} />
                    <span className="text-sm">{a.nome}</span>
                    {a.owner && <Badge variant="outline" className="text-xs ml-auto">Owner definido</Badge>}
                  </label>
                ))}
                {filteredApps.length === 0 && <EmptyState message="Nenhuma aplicação encontrada" size="sm" />}
              </ScrollArea>
            </div>

            {/* Grupos */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" /> Grupos
                {selectedGrupos.length > 0 && <Badge variant="secondary" className="text-xs">{selectedGrupos.length} selecionado(s)</Badge>}
              </label>
              <Input placeholder="Buscar grupo..." value={buscaGrupo} onChange={e => setBuscaGrupo(e.target.value)} />
              <ScrollArea className="h-36 rounded-md border p-2">
                {filteredGrupos.map(g => (
                  <label key={g.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
                    <Checkbox checked={selectedGrupos.includes(g.id)} onCheckedChange={() => toggleItem(selectedGrupos, setSelectedGrupos, g.id)} />
                    <span className="text-sm">{g.nome}</span>
                    {g.owner && <Badge variant="outline" className="text-xs ml-auto">Owner definido</Badge>}
                  </label>
                ))}
                {filteredGrupos.length === 0 && <EmptyState message="Nenhum grupo encontrado" size="sm" />}
              </ScrollArea>
            </div>

            {/* Licenças */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Licenças
                {selectedLicencas.length > 0 && <Badge variant="secondary" className="text-xs">{selectedLicencas.length} selecionada(s)</Badge>}
              </label>
              <Input placeholder="Buscar licença..." value={buscaLicenca} onChange={e => setBuscaLicenca(e.target.value)} />
              <ScrollArea className="h-36 rounded-md border p-2">
                {filteredLicencas.map(l => (
                  <label key={l.id} className="flex items-center gap-2 py-1.5 px-1 hover:bg-muted/50 rounded cursor-pointer">
                    <Checkbox checked={selectedLicencas.includes(l.id)} onCheckedChange={() => toggleItem(selectedLicencas, setSelectedLicencas, l.id)} />
                    <span className="text-sm">{l.nome}</span>
                    {l.owner && <Badge variant="outline" className="text-xs ml-auto">Owner definido</Badge>}
                  </label>
                ))}
                {filteredLicencas.length === 0 && <EmptyState message="Nenhuma licença encontrada" size="sm" />}
              </ScrollArea>
            </div>

            {/* Justificativa */}
            <div>
              <label className="text-sm font-medium">Justificativa</label>
              <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Explique por que este acesso é necessário..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}><Send className="mr-2 h-4 w-4" />Enviar Solicitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision Dialog — per-item */}
      <Dialog open={!!decisionDialog} onOpenChange={() => { setDecisionDialog(null); setDecisionItens([]); setComentario(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Decidir Solicitação</DialogTitle>
          </DialogHeader>
          {decisionDialog && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <p><strong>Solicitante:</strong> {colabMap.get(decisionDialog.solicitante_id)?.nome || "—"}</p>
                <p><strong>Justificativa:</strong> {decisionDialog.justificativa}</p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Itens pendentes de aprovação:</p>
                {decisionItens.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum item pendente</p>
                ) : (
                  <div className="space-y-1">
                    {decisionItens.map((item: any) => {
                      const iconMap: Record<string, any> = { app: AppWindow, grupo: Users, licenca: KeyRound };
                      const Icon = iconMap[item.tipo] || AppWindow;
                      const tipoLabel: Record<string, string> = { app: "Aplicação", grupo: "Grupo", licenca: "Licença" };
                      return (
                        <div key={item.id} className="flex items-center gap-2 p-2 rounded border">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{item.recurso_nome}</span>
                          <Badge variant="outline" className="text-xs ml-auto">{tipoLabel[item.tipo] || item.tipo}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Comentário (opcional)</label>
                <Textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Adicione um comentário sobre a decisão..." />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDecisionDialog(null); setDecisionItens([]); setComentario(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={() => handleDecision("rejeitada")} disabled={decisionItens.length === 0}>
              <XCircle className="mr-2 h-4 w-4" />Rejeitar Todos
            </Button>
            <Button onClick={() => handleDecision("aprovada")} disabled={decisionItens.length === 0}>
              <CheckCircle2 className="mr-2 h-4 w-4" />Aprovar Todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OnboardingTour pageKey="solicitacoes" steps={tourSteps.solicitacoes} />
    </div>
  );
}
