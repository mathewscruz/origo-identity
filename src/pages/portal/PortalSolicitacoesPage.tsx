import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Plus, Clock, CheckCircle2, XCircle, Send, FileText, AppWindow, Users, KeyRound, Sparkles, UserCog, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

import CatalogResourceList from "./sections/CatalogResourceList";
import CartPanel from "./sections/CartPanel";
import RequestApprovalCard from "./sections/RequestApprovalCard";
import PeersRecommendations from "./sections/PeersRecommendations";
import { startWorkflow } from "@/lib/workflow/engine";

const iconForTipo = { app: AppWindow, grupo: Users, licenca: KeyRound };

function extractOwnerEmail(owner: string | null): string | null {
  if (!owner) return null;
  const match = owner.match(/<(.+?)>/);
  const email = match ? match[1] : owner;
  return email.includes("@") ? email : null;
}

interface Colab {
  id: string;
  nome: string;
  email: string | null;
  cargo_id: string | null;
  area_id: string | null;
  entra_id: string | null;
  sam_account_name: string | null;
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

  // Identity context
  const [selfColab, setSelfColab] = useState<Colab | null>(null);
  const [teamMembers, setTeamMembers] = useState<Colab[]>([]);
  const [solicitandoParaId, setSolicitandoParaId] = useState<string>("");

  // Catalog context (relative to the target requester)
  const [ownedAppIds, setOwnedAppIds] = useState<Set<string>>(new Set());
  const [ownedGrupoIds, setOwnedGrupoIds] = useState<Set<string>>(new Set());
  const [ownedLicencaIds, setOwnedLicencaIds] = useState<Set<string>>(new Set());
  const [recAppIds, setRecAppIds] = useState<Set<string>>(new Set());
  const [recGrupoIds, setRecGrupoIds] = useState<Set<string>>(new Set());
  const [recLicencaIds, setRecLicencaIds] = useState<Set<string>>(new Set());

  // SoD conflicts (resources that would create a conflict for the target identity)
  const [conflictAppIds, setConflictAppIds] = useState<Set<string>>(new Set());
  const [conflictGrupoIds, setConflictGrupoIds] = useState<Set<string>>(new Set());
  const [conflictLicencaIds, setConflictLicencaIds] = useState<Set<string>>(new Set());
  const [conflictDetails, setConflictDetails] = useState<string[]>([]);

  // Peers in same area
  const [peerResources, setPeerResources] = useState<{ id: string; nome: string; tipo: "app" | "grupo" | "licenca"; count: number; pctPeers: number }[]>([]);
  const [totalPeers, setTotalPeers] = useState(0);

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

  // Reload catalog context whenever the target requester changes
  useEffect(() => {
    const target = targetColab();
    if (target) void loadCatalogContext(target);
  }, [solicitandoParaId, selfColab]);

  function targetColab(): Colab | null {
    if (solicitandoParaId) return teamMembers.find((m) => m.id === solicitandoParaId) ?? null;
    return selfColab;
  }

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
      (supabase as any).rpc("licencas_catalogo"),
      supabase.from("solicitacao_itens").select("*").order("created_at"),
    ]);
    setSolicitacoes(solRes.data ?? []);
    setAplicacoes(appRes.data ?? []);
    setGrupos(grpRes.data ?? []);
    setLicencas([...((licRes.data as any[]) ?? [])].sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "")));

    setSolicitacaoItens(itensRes.data ?? []);
    setLoading(false);

    if (userEmail) {
      const { data: meColab } = await supabase
        .from("colaboradores")
        .select("id, nome, email, cargo_id, area_id, entra_id, sam_account_name")
        .eq("email", userEmail)
        .maybeSingle();
      if (meColab) {
        setSelfColab(meColab as Colab);
        // Load direct reports (when current user is gestor)
        const { data: reports } = await supabase
          .from("colaboradores")
          .select("id, nome, email, cargo_id, area_id, entra_id, sam_account_name")
          .eq("gestor_id", meColab.id)
          .eq("status", "ativo")
          .order("nome");
        setTeamMembers((reports ?? []) as Colab[]);
      }
    }
  }

  async function loadCatalogContext(target: Colab) {
    // Effective profile assignments (active) for the TARGET person
    const { data: atribs } = await supabase
      .from("perfil_atribuicoes")
      .select("perfil_id")
      .eq("colaborador_id", target.id)
      .eq("ativo", true);
    const ownedPerfilIds = (atribs ?? []).map((a: any) => a.perfil_id);

    // Recommended profiles by cargo (excluding ones the target already has)
    let recPerfilIds: string[] = [];
    if (target.cargo_id) {
      const { data: cp } = await supabase
        .from("cargo_perfis")
        .select("perfil_id")
        .eq("cargo_id", target.cargo_id);
      recPerfilIds = (cp ?? [])
        .map((r: any) => r.perfil_id)
        .filter((pid: string) => !ownedPerfilIds.includes(pid));
    }

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
    setRecAppIds(new Set([...rec.apps].filter((id) => !owned.apps.has(id))));
    setRecGrupoIds(new Set([...rec.grupos].filter((id) => !owned.grupos.has(id))));
    setRecLicencaIds(new Set([...rec.licencas].filter((id) => !owned.licencas.has(id))));

    // SoD conflicts: profiles in conflict with the target's owned profiles
    if (ownedPerfilIds.length > 0) {
      const { data: sods } = await (supabase as any)
        .from("sod_conflitos")
        .select("perfil_a_id, perfil_b_id, descricao, severidade, ativo")
        .eq("ativo", true);
      const conflictingPerfilIds = new Set<string>();
      const details: string[] = [];
      for (const s of (sods ?? []) as any[]) {
        if (ownedPerfilIds.includes(s.perfil_a_id)) {
          conflictingPerfilIds.add(s.perfil_b_id);
          details.push(s.descricao || "Conflito SoD detectado");
        }
        if (ownedPerfilIds.includes(s.perfil_b_id)) {
          conflictingPerfilIds.add(s.perfil_a_id);
          details.push(s.descricao || "Conflito SoD detectado");
        }
      }
      const conflictRes = await resolveResources(Array.from(conflictingPerfilIds));
      // Resources the user already owns are not in conflict (they live in owned profiles)
      setConflictAppIds(new Set([...conflictRes.apps].filter((id) => !owned.apps.has(id))));
      setConflictGrupoIds(new Set([...conflictRes.grupos].filter((id) => !owned.grupos.has(id))));
      setConflictLicencaIds(new Set([...conflictRes.licencas].filter((id) => !owned.licencas.has(id))));
      setConflictDetails(Array.from(new Set(details)));
    } else {
      setConflictAppIds(new Set());
      setConflictGrupoIds(new Set());
      setConflictLicencaIds(new Set());
      setConflictDetails([]);
    }

    // Peers in same area
    if (target.area_id) {
      const { data: peers } = await supabase
        .from("colaboradores")
        .select("id")
        .eq("area_id", target.area_id)
        .eq("status", "ativo")
        .neq("id", target.id);
      const peerIds = (peers ?? []).map((p: any) => p.id);
      setTotalPeers(peerIds.length);
      if (peerIds.length > 0) {
        const { data: peerAtribs } = await supabase
          .from("perfil_atribuicoes")
          .select("perfil_id, colaborador_id")
          .in("colaborador_id", peerIds)
          .eq("ativo", true);
        const peerProfileIds = Array.from(new Set((peerAtribs ?? []).map((a: any) => a.perfil_id)));
        if (peerProfileIds.length > 0) {
          const [pa, pg, pl] = await Promise.all([
            (supabase as any).from("perfil_aplicacoes").select("aplicacao_id, perfil_id").in("perfil_id", peerProfileIds),
            (supabase as any).from("perfil_grupos").select("grupo_id, perfil_id").in("perfil_id", peerProfileIds),
            (supabase as any).from("perfil_licencas").select("licenca_id, perfil_id").in("perfil_id", peerProfileIds),
          ]);
          // Map perfil_id -> set of peer ids
          const perfilToPeers = new Map<string, Set<string>>();
          for (const a of peerAtribs ?? []) {
            const s = perfilToPeers.get(a.perfil_id) ?? new Set<string>();
            s.add(a.colaborador_id);
            perfilToPeers.set(a.perfil_id, s);
          }
          const countResources = (rows: any[], idKey: string) => {
            const map = new Map<string, Set<string>>();
            for (const r of rows ?? []) {
              const peersOfPerfil = perfilToPeers.get(r.perfil_id) ?? new Set();
              const s = map.get(r[idKey]) ?? new Set<string>();
              peersOfPerfil.forEach((p) => s.add(p));
              map.set(r[idKey], s);
            }
            return map;
          };
          const appsMap = countResources(pa.data ?? [], "aplicacao_id");
          const gruposMap = countResources(pg.data ?? [], "grupo_id");
          const licencasMap = countResources(pl.data ?? [], "licenca_id");

          
          const collect = (
            map: Map<string, Set<string>>,
            tipo: "app" | "grupo" | "licenca",
            ownedSet: Set<string>,
            nameLookup: Map<string, string>,
          ) => {
            const out: any[] = [];
            map.forEach((peersSet, id) => {
              if (ownedSet.has(id)) return;
              out.push({
                id, tipo, nome: nameLookup.get(id) || id,
                count: peersSet.size,
                pctPeers: Math.round((peersSet.size / peerIds.length) * 100),
              });
            });
            return out;
          };
          const appNames = new Map(aplicacoes.map((a: any) => [a.id, a.nome]));
          const grupoNames = new Map(grupos.map((g: any) => [g.id, g.nome]));
          const licencaNames = new Map(licencas.map((l: any) => [l.id, l.nome]));
          const all = [
            ...collect(appsMap, "app", owned.apps, appNames),
            ...collect(gruposMap, "grupo", owned.grupos, grupoNames),
            ...collect(licencasMap, "licenca", owned.licencas, licencaNames),
          ];
          all.sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome));
          setPeerResources(all);
        } else {
          setPeerResources([]);
        }
      } else {
        setPeerResources([]);
      }
    } else {
      setTotalPeers(0);
      setPeerResources([]);
    }
  }



  const appMap = useMemo(() => new Map(aplicacoes.map((a) => [a.id, a])), [aplicacoes]);
  const grupoMap = useMemo(() => new Map(grupos.map((g) => [g.id, g])), [grupos]);
  const licencaMap = useMemo(() => new Map(licencas.map((l) => [l.id, l])), [licencas]);

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
    setList((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const renderItemStatusBadges = (solicitacaoId: string) => {
    const items = solicitacaoItens.filter((i) => i.solicitacao_id === solicitacaoId);
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

  // ===== Cart computations =====
  const conflictCount =
    selectedApps.filter((id) => conflictAppIds.has(id)).length +
    selectedGrupos.filter((id) => conflictGrupoIds.has(id)).length +
    selectedLicencas.filter((id) => conflictLicencaIds.has(id)).length;

  const cartItems = useMemo(() => {
    const items: { id: string; tipo: "app" | "grupo" | "licenca"; nome: string; conflict?: boolean }[] = [];
    selectedApps.forEach((id) => {
      const a = appMap.get(id);
      if (a) items.push({ id, tipo: "app", nome: a.nome, conflict: conflictAppIds.has(id) });
    });
    selectedGrupos.forEach((id) => {
      const g = grupoMap.get(id);
      if (g) items.push({ id, tipo: "grupo", nome: g.nome, conflict: conflictGrupoIds.has(id) });
    });
    selectedLicencas.forEach((id) => {
      const l = licencaMap.get(id);
      if (l) items.push({ id, tipo: "licenca", nome: l.nome, conflict: conflictLicencaIds.has(id) });
    });
    return items;
  }, [selectedApps, selectedGrupos, selectedLicencas, appMap, grupoMap, licencaMap, conflictAppIds, conflictGrupoIds, conflictLicencaIds]);

  const removeCartItem = (item: { id: string; tipo: "app" | "grupo" | "licenca" }) => {
    if (item.tipo === "app") setSelectedApps((p) => p.filter((id) => id !== item.id));
    if (item.tipo === "grupo") setSelectedGrupos((p) => p.filter((id) => id !== item.id));
    if (item.tipo === "licenca") setSelectedLicencas((p) => p.filter((id) => id !== item.id));
  };
  const clearCart = () => { setSelectedApps([]); setSelectedGrupos([]); setSelectedLicencas([]); };

  const addPeerSuggestion = (tipo: "app" | "grupo" | "licenca", id: string) => {
    if (tipo === "app") setSelectedApps((p) => (p.includes(id) ? p : [...p, id]));
    if (tipo === "grupo") setSelectedGrupos((p) => (p.includes(id) ? p : [...p, id]));
    if (tipo === "licenca") setSelectedLicencas((p) => (p.includes(id) ? p : [...p, id]));
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
    if (conflictCount > 0) {
      toast({
        title: "Conflito de Segregação de Funções (SoD)",
        description: "Remova os itens marcados como conflito antes de enviar a solicitação.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    const target = targetColab();
    const solicitanteId = target?.id ?? null;

    if (!solicitanteId) {
      toast({ title: "Erro", description: "Não foi possível identificar o destinatário da solicitação.", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const itemRecords: any[] = [];
    for (const appId of selectedApps) {
      const app = appMap.get(appId);
      const ownerEmail = extractOwnerEmail(app?.owner);
      itemRecords.push({ tipo: "app", recurso_id: appId, recurso_nome: app?.nome || appId, owner_email: ownerEmail, status: "pendente" });
    }
    for (const grpId of selectedGrupos) {
      const grp = grupoMap.get(grpId);
      const ownerEmail = extractOwnerEmail(grp?.owner);
      itemRecords.push({ tipo: "grupo", recurso_id: grpId, recurso_nome: grp?.nome || grpId, owner_email: ownerEmail, status: "pendente" });
    }
    for (const licId of selectedLicencas) {
      const lic = licencaMap.get(licId);
      const ownerEmail = extractOwnerEmail(lic?.owner);
      itemRecords.push({ tipo: "licenca", recurso_id: licId, recurso_nome: lic?.nome || licId, owner_email: ownerEmail, status: "pendente" });
    }

    const justificativaFinal = solicitandoParaId
      ? `[Solicitado por ${userEmail} em nome de ${target!.nome}] ${justificativa.trim()}`
      : justificativa.trim();

    const { data: inserted, error } = await supabase.from("solicitacoes_acesso").insert({
      solicitante_id: solicitanteId,
      perfil_id: null,
      aplicacoes_ids: selectedApps,
      grupos_ids: selectedGrupos,
      licencas_ids: selectedLicencas,
      justificativa: justificativaFinal,
      status: "em_aprovacao",
      user_id: userId,
    } as any).select("id").single();

    if (error) {
      toast({ title: "Erro ao enviar solicitação", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const itemsToInsert = itemRecords.map((i) => ({ ...i, solicitacao_id: inserted!.id }));
    const { data: insertedItens } = await supabase
      .from("solicitacao_itens")
      .insert(itemsToInsert as any)
      .select("id, tipo, recurso_id, recurso_nome, owner_email");

    const colabData = target;

    const result = await startWorkflow(
      "solicitacao",
      inserted!.id,
      solicitanteId,
      {
        solicitanteEmail: colabData?.email || userEmail || null,
        itens: (insertedItens || itemsToInsert) as any,
        aplicacaoIds: selectedApps,
        grupoIds: selectedGrupos,
        licencaIds: selectedLicencas,
        perfilId: null,
      },
      userEmail || "portal",
    );

    if (result.status === "aprovada") {
      toast({ title: "Solicitação enviada e aprovada automaticamente!" });
    } else if (result.status === "rejeitada") {
      toast({ title: "Solicitação rejeitada pelo fluxo", variant: "destructive" });
    } else {
      toast({ title: "Solicitação enviada!", description: "Aguardando aprovadores configurados no fluxo." });
    }


    setDialogOpen(false);
    clearCart();
    setJustificativa("");
    setBuscaApp("");
    setBuscaGrupo("");
    setBuscaLicenca("");
    setSolicitandoParaId("");
    fetchData();
    setSubmitting(false);
  };

  const totais = {
    total: solicitacoes.length,
    pendentes: solicitacoes.filter((s) => s.status === "pendente" || s.status === "em_aprovacao").length,
    aprovadas: solicitacoes.filter((s) => s.status === "aprovada").length,
    rejeitadas: solicitacoes.filter((s) => s.status === "rejeitada").length,
  };

  const catalogSort = (selected: string[], owned: Set<string>, rec: Set<string>) =>
    (a: any, b: any) => {
      const score = (x: any) => (selected.includes(x.id) ? 0 : rec.has(x.id) ? 1 : owned.has(x.id) ? 3 : 2);
      const sa = score(a); const sb = score(b);
      return sa - sb || a.nome.localeCompare(b.nome);
    };

  const filteredApps = aplicacoes
    .filter((a) => !buscaApp || a.nome.toLowerCase().includes(buscaApp.toLowerCase()))
    .sort(catalogSort(selectedApps, ownedAppIds, recAppIds));
  const filteredGrupos = grupos
    .filter((g) => !buscaGrupo || g.nome.toLowerCase().includes(buscaGrupo.toLowerCase()))
    .sort(catalogSort(selectedGrupos, ownedGrupoIds, recGrupoIds));
  const filteredLicencas = licencas
    .filter((l) => !buscaLicenca || l.nome.toLowerCase().includes(buscaLicenca.toLowerCase()))
    .sort(catalogSort(selectedLicencas, ownedLicencaIds, recLicencaIds));

  const totalRecomendados = recAppIds.size + recGrupoIds.size + recLicencaIds.size;

  const applyAllRecommendations = () => {
    setSelectedApps((prev) => Array.from(new Set([...prev, ...recAppIds])));
    setSelectedGrupos((prev) => Array.from(new Set([...prev, ...recGrupoIds])));
    setSelectedLicencas((prev) => Array.from(new Set([...prev, ...recLicencaIds])));
  };

  const openRequests = solicitacoes.filter((s) => s.status === "em_aprovacao" || s.status === "pendente");

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

      {/* Open request cards with approval timeline */}
      {openRequests.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Em andamento</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {openRequests.slice(0, 4).map((s) => (
              <RequestApprovalCard
                key={s.id}
                solicitacao={s}
                items={solicitacaoItens.filter((i) => i.solicitacao_id === s.id) as any}
              />
            ))}
          </div>
        </div>
      )}

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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Solicitação de Acesso</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Solicitando para (manager shortcut) */}
            {teamMembers.length > 0 && (
              <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
                <UserCog className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <Label className="text-xs text-muted-foreground">Solicitando para</Label>
                  <Select value={solicitandoParaId || "self"} onValueChange={(v) => setSolicitandoParaId(v === "self" ? "" : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">Para mim {selfColab?.nome ? `(${selfColab.nome})` : ""}</SelectItem>
                      {teamMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}{m.email ? ` — ${m.email}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Cart (persistent) */}
            <CartPanel
              items={cartItems}
              onRemove={removeCartItem}
              onClear={clearCart}
              conflictCount={conflictCount}
            />

            {/* SoD blocking alert */}
            {conflictCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">Existem {conflictCount} item(ns) com conflito de Segregação de Funções no carrinho.</p>
                  {conflictDetails.length > 0 && (
                    <ul className="mt-1 text-xs list-disc list-inside">
                      {conflictDetails.slice(0, 3).map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}
                  <p className="text-xs mt-1">Remova os itens marcados para enviar a solicitação.</p>
                </AlertDescription>
              </Alert>
            )}

            {/* Cargo recommendations */}
            {totalRecomendados > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">Recomendado para o cargo</p>
                  <p className="text-xs text-muted-foreground">
                    {totalRecomendados} recurso(s) costumam ser usados por colegas do mesmo cargo.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={applyAllRecommendations}>Selecionar todos</Button>
              </div>
            )}

            {/* Peers in same area */}
            <PeersRecommendations
              totalPeers={totalPeers}
              resources={peerResources}
              selected={{ app: selectedApps, grupo: selectedGrupos, licenca: selectedLicencas }}
              onAdd={addPeerSuggestion}
              iconForTipo={iconForTipo}
            />

            <CatalogResourceList
              icon={AppWindow} label="Aplicações" itemLabel="selecionada(s)"
              searchPlaceholder="Buscar aplicação..." emptyMessage="Nenhuma aplicação encontrada"
              search={buscaApp} onSearchChange={setBuscaApp}
              items={filteredApps} selected={selectedApps}
              ownedIds={ownedAppIds} recommendedIds={recAppIds} conflictIds={conflictAppIds}
              onToggle={(id) => toggleItem(selectedApps, setSelectedApps, id)}
            />

            <CatalogResourceList
              icon={Users} label="Grupos" itemLabel="selecionado(s)"
              searchPlaceholder="Buscar grupo..." emptyMessage="Nenhum grupo encontrado"
              search={buscaGrupo} onSearchChange={setBuscaGrupo}
              items={filteredGrupos} selected={selectedGrupos}
              ownedIds={ownedGrupoIds} recommendedIds={recGrupoIds} conflictIds={conflictGrupoIds}
              onToggle={(id) => toggleItem(selectedGrupos, setSelectedGrupos, id)}
            />

            <CatalogResourceList
              icon={KeyRound} label="Licenças" itemLabel="selecionada(s)"
              searchPlaceholder="Buscar licença..." emptyMessage="Nenhuma licença encontrada"
              search={buscaLicenca} onSearchChange={setBuscaLicenca}
              items={filteredLicencas} selected={selectedLicencas}
              ownedIds={ownedLicencaIds} recommendedIds={recLicencaIds} conflictIds={conflictLicencaIds}
              onToggle={(id) => toggleItem(selectedLicencas, setSelectedLicencas, id)}
            />

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
            <Button onClick={handleSubmit} disabled={submitting || conflictCount > 0}>
              {submitting ? "Enviando..." : conflictCount > 0 ? "Resolva os conflitos SoD" : "Enviar Solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
