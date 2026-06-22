import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import { useAuth } from "@/contexts/AuthContext";
import { HandHelping, Plus, Search, Clock, CheckCircle2, XCircle, ExternalLink, AppWindow, Users, KeyRound } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import NovaSolicitacaoDialog from "./sections/NovaSolicitacaoDialog";
import DecisaoDialog from "./sections/DecisaoDialog";
import { startWorkflow, recordDecision } from "@/lib/workflow/engine";

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

    const { data: inserted, error } = await supabase.from("solicitacoes_acesso").insert({
      solicitante_id: solicitanteId,
      aplicacoes_ids: selectedApps,
      grupos_ids: selectedGrupos,
      licencas_ids: selectedLicencas,
      justificativa: justificativa.trim(),
      status: "em_aprovacao",
    } as any).select("id").single();

    if (error) {
      toast({ title: "Erro ao criar solicitação", description: error.message, variant: "destructive" });
      return;
    }

    const itemRecords = buildItensRecords(inserted!.id);
    const { data: insertedItens } = await supabase
      .from("solicitacao_itens")
      .insert(itemRecords as any)
      .select("id, tipo, recurso_id, recurso_nome, owner_email");

    const colab = colabMap.get(solicitanteId);
    const colabNome = colab?.nome || "—";

    // Inicia o motor de workflow
    const result = await startWorkflow(
      "solicitacao",
      inserted!.id,
      solicitanteId,
      {
        solicitanteEmail: colab?.email || null,
        itens: (insertedItens || itemRecords) as any,
        aplicacaoIds: selectedApps,
        grupoIds: selectedGrupos,
        licencaIds: selectedLicencas,
        perfilId: null,
      },
      profile?.email || "sistema",
    );

    await logAuditoria({
      acao: "criar",
      entidade: "solicitacao_acesso",
      entidade_id: inserted?.id,
      resumo: `Solicitação de acesso: ${colabNome} → ${itemRecords.map((i: any) => i.recurso_nome).join(", ")}`,
      operador: profile?.email || "sistema",
    });

    if (result.status === "aprovada") {
      toast({ title: "Solicitação criada e aprovada automaticamente" });
    } else if (result.status === "rejeitada") {
      toast({ title: "Solicitação criada e rejeitada pelo fluxo", variant: "destructive" });
    } else {
      toast({ title: "Solicitação criada", description: "Aguardando aprovadores do fluxo configurado." });
    }

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
    if (!decisionDialog) return;

    const aprovadorEmail = profile?.email || "sistema";

    try {
      await recordDecision(
        decisionDialog.id,
        aprovadorEmail,
        decisao,
        comentario || null,
        profile?.nome || profile?.email || "Sistema",
      );
      toast({ title: `Decisão registrada: ${decisao}` });
    } catch (e: any) {
      toast({ title: "Erro ao registrar decisão", description: e.message, variant: "destructive" });
    }

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
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
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

      <NovaSolicitacaoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        colabs={colaboradores}
        apps={filteredApps}
        grupos={filteredGrupos}
        licencas={filteredLicencas}
        solicitanteId={solicitanteId}
        setSolicitanteId={setSolicitanteId}
        selectedApps={selectedApps}
        selectedGrupos={selectedGrupos}
        selectedLicencas={selectedLicencas}
        onToggleApp={(id) => toggleItem(selectedApps, setSelectedApps, id)}
        onToggleGrupo={(id) => toggleItem(selectedGrupos, setSelectedGrupos, id)}
        onToggleLicenca={(id) => toggleItem(selectedLicencas, setSelectedLicencas, id)}
        justificativa={justificativa}
        setJustificativa={setJustificativa}
        buscaColab={buscaColab} setBuscaColab={setBuscaColab}
        buscaApp={buscaApp} setBuscaApp={setBuscaApp}
        buscaGrupo={buscaGrupo} setBuscaGrupo={setBuscaGrupo}
        buscaLicenca={buscaLicenca} setBuscaLicenca={setBuscaLicenca}
        onSubmit={handleSubmit}
      />

      <DecisaoDialog
        open={!!decisionDialog}
        onClose={() => { setDecisionDialog(null); setDecisionItens([]); setComentario(""); }}
        solicitacao={decisionDialog}
        solicitanteNome={decisionDialog ? colabMap.get(decisionDialog.solicitante_id)?.nome || "—" : ""}
        itens={decisionItens}
        comentario={comentario}
        setComentario={setComentario}
        onDecision={handleDecision}
      />

      <OnboardingTour pageKey="solicitacoes" steps={tourSteps.solicitacoes} />
    </div>
  );
}
