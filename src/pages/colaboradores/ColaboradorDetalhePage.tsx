import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Pencil, Plus, KeyRound, ChevronDown, Shield, Award, AppWindow, RefreshCw, ShieldAlert, ShieldCheck, FolderOpen, Bot,
  Mail, Copy, Check, AtSign, Hash, Briefcase, Building2, MapPin, CalendarDays, UserCircle2, Cloud, CloudOff, Activity, Crown, ListOrdered, MoreHorizontal, Workflow, Sparkles, Layers, History, Info,
} from "lucide-react";
import { useColaborador, usePerfilAtribuicoes, useEventosJML, usePerfisAcesso, useEntraGrupos, useEntraLicencas, useAplicacoes, useColabIndividualQueue, useSharepointSites, useAllSharepointPastas } from "@/hooks/useOrigoData";
import { generateEntraQueueForDiff } from "@/lib/entraQueueHelper";
import { handleStatusChange, syncSingleUserAccess } from "@/lib/colaboradorLifecycle";
import { suspendColaboradorPreventivo, revertSuspensaoPreventiva } from "@/lib/preLeaver";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCanEdit } from "@/hooks/useRole";
import { logAuditoria } from "@/lib/auditLogger";
import { COLAB_STATUS_META, QUEUE_OPEN_STATUSES } from "@/lib/queueLabels";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import ActivityFeed from "@/components/ActivityFeed";
import { formatAreaName } from "@/lib/formatters";
import { useResourceNameResolver } from "@/lib/resourceNames";
import { humanize } from "@/lib/labels";
import { cn } from "@/lib/utils";
import IndividualAccessTabs from "./sections/IndividualAccessTabs";
import PrivilegedRolesSection from "./sections/PrivilegedRolesSection";
import PerfisAtribuidosTable from "./sections/PerfisAtribuidosTable";
import JMLTimeline from "./sections/JMLTimeline";
import StartJmlEventDialog from "@/components/jml/StartJmlEventDialog";
import { useAssignPerfil, useRevokePerfil } from "@/hooks/mutations/usePerfilAssignment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const STATUS_RING: Record<string, string> = {
  ativo: "ring-success/40 bg-success/15 text-success",
  ferias: "ring-info/40 bg-info/15 text-info",
  afastado: "ring-warning/40 bg-warning/15 text-warning",
  inativo: "ring-muted-foreground/30 bg-muted text-muted-foreground",
  desligado: "ring-destructive/40 bg-destructive/15 text-destructive",
};
const STATUS_BAR: Record<string, string> = {
  ativo: "from-success/80 via-success/40 to-primary/30",
  ferias: "from-info/80 via-info/40 to-primary/30",
  afastado: "from-warning/80 via-warning/40 to-primary/30",
  inativo: "from-muted-foreground/50 via-muted-foreground/20 to-transparent",
  desligado: "from-destructive/80 via-destructive/40 to-transparent",
};

function Fact({ icon: Icon, label, value, mono, copy, to }: { icon: typeof Mail; label: string; value?: string | null; mono?: boolean; copy?: boolean; to?: string }) {
  const [copied, setCopied] = useState(false);
  const v = value && value !== "—" ? value : null;
  const body = (
    <span className={cn("truncate", mono && "font-mono text-[12px]", !v && "text-muted-foreground/60")}>{v ?? "—"}</span>
  );
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      {to && v ? <Link to={to} className="truncate font-medium text-primary hover:underline">{v}</Link> : body}
      {copy && v && (
        <button type="button" className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" title="Copiar" onClick={() => { navigator.clipboard.writeText(v).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}>
          {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

export default function ColaboradorDetalhePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: pessoa, isLoading } = useColaborador(id);
  const resolveResourceName = useResourceNameResolver();
  const canEdit = useCanEdit();

  const { data: atribuicoes } = usePerfilAtribuicoes(undefined, id);
  const { data: allEventos } = useEventosJML();
  const { data: perfisDisponiveis } = usePerfisAcesso();
  const { data: entraGrupos } = useEntraGrupos();
  const { data: entraLicencas } = useEntraLicencas();
  const { data: aplicacoes } = useAplicacoes();
  const { data: sharepointSites } = useSharepointSites();
  const { data: sharepointPastas } = useAllSharepointPastas();
  const { data: individualQueue } = useColabIndividualQueue(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();
  const assignPerfil = useAssignPerfil();
  const revokePerfil = useRevokePerfil();
  const lastBackgroundSyncColabId = useRef<string | null>(null);

  // itens abertos na fila para esta pessoa (contexto do que ainda vai acontecer)
  const { data: filaAberta } = useQuery({
    queryKey: ["iam_queue", "colab_open", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase.from("iam_queue").select("id, action_type, status").eq("colaborador_id", id!).in("status", QUEUE_OPEN_STATUSES);
      return (data ?? []) as Row[];
    },
  });
  const { data: privCount } = useQuery({
    queryKey: ["entra_role_members", "count", id],
    enabled: !!id,
    queryFn: async () => { const { count } = await supabase.from("entra_role_members").select("id", { count: "exact", head: true }).eq("colaborador_id", id!); return count ?? 0; },
  });

  useEffect(() => {
    if (!id || !pessoa || lastBackgroundSyncColabId.current === id) return;
    lastBackgroundSyncColabId.current = id;
    let cancelled = false;
    void syncSingleUserAccess(id).then(async (res) => {
      if (cancelled) return;
      if (res.success) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["colab_individual_queue", id] }),
          queryClient.invalidateQueries({ queryKey: ["iam_queue"] }),
          queryClient.invalidateQueries({ queryKey: ["colaborador", id] }),
        ]);
        await queryClient.refetchQueries({ queryKey: ["colab_individual_queue", id] });
      } else {
        console.warn("[ColaboradorDetalhePage] background sync-user-access failed", res.message);
      }
    }).catch((err) => { if (!cancelled) console.warn("[ColaboradorDetalhePage] background sync-user-access error", err); });
    return () => { cancelled = true; };
  }, [id, pessoa, queryClient]);

  const tab = searchParams.get("tab") || "visao";
  const setTab = (t: string) => { const n = new URLSearchParams(searchParams); if (t === "visao") n.delete("tab"); else n.set("tab", t); setSearchParams(n, { replace: true }); };

  const [atribuirOpen, setAtribuirOpen] = useState(false);
  const [selectedPerfilId, setSelectedPerfilId] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetingPassword, setResetingPassword] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetMotivo, setResetMotivo] = useState("");
  const [syncing, setSyncing] = useState(false);

  const [grupoDialogOpen, setGrupoDialogOpen] = useState(false);
  const [licencaDialogOpen, setLicencaDialogOpen] = useState(false);
  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [sharepointDialogOpen, setSharepointDialogOpen] = useState(false);
  const [selectedGrupoId, setSelectedGrupoId] = useState("");
  const [selectedLicencaId, setSelectedLicencaId] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedSharepointSiteId, setSelectedSharepointSiteId] = useState("");
  const [selectedSharepointPastaId, setSelectedSharepointPastaId] = useState("__root__");
  const [selectedSharepointPermission, setSelectedSharepointPermission] = useState("leitura");
  const [savingIndividual, setSavingIndividual] = useState(false);

  const [preLeaverOpen, setPreLeaverOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [preLeaverMotivo, setPreLeaverMotivo] = useState("");
  const [savingPreLeaver, setSavingPreLeaver] = useState(false);
  const [startJmlOpen, setStartJmlOpen] = useState(false);

  const eventos = useMemo(() => (allEventos ?? []).filter((e) => e.colaborador_id === id), [allEventos, id]);

  function getColabIdentity() {
    return { id: id!, nome: pessoa.nome, email: pessoa.email || null, sam_account_name: (pessoa as Row)?.sam_account_name || null };
  }

  async function handleAtribuir() {
    if (!selectedPerfilId || !id) return;
    setSaving(true);
    try {
      await assignPerfil.mutateAsync({ identity: getColabIdentity(), perfilId: selectedPerfilId, operadorEmail: profile?.email });
      setAtribuirOpen(false); setSelectedPerfilId("");
    } catch { /* toast no hook */ } finally { setSaving(false); }
  }
  async function handleRevogar(atribuicaoId: string, perfilId?: string) {
    if (!perfilId) return;
    await revokePerfil.mutateAsync({ atribuicaoId, identity: getColabIdentity(), perfilId, operadorEmail: profile?.email });
  }

  async function enqueueIndividual(diff: Row, done: () => void, acao: string, resumo: string, titulo: string, desc?: string) {
    if (!id) return;
    setSavingIndividual(true);
    try {
      await generateEntraQueueForDiff([getColabIdentity()], diff, { requestedBy: "manual_individual" });
      toast({ title: titulo, description: desc });
      await logAuditoria({ acao, entidade: "iam_queue", entidade_id: id, resumo, operador: profile?.email, detalhes: { colaborador_id: id } });
      queryClient.invalidateQueries({ queryKey: ["colab_individual_queue"] });
      done();
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setSavingIndividual(false); }
  }
  const emptyDiff = { addedGrupoIds: [] as string[], removedGrupoIds: [] as string[], addedLicencaIds: [] as string[], removedLicencaIds: [] as string[], addedAppIds: [] as string[], removedAppIds: [] as string[] };
  const handleAssignIndividualGroup = () => {
    const grupo = (entraGrupos ?? []).find((g: Row) => g.id === selectedGrupoId);
    return enqueueIndividual({ ...emptyDiff, addedGrupoIds: [selectedGrupoId] }, () => { setGrupoDialogOpen(false); setSelectedGrupoId(""); }, "atribuir_grupo_individual", `Grupo "${grupo?.nome}" atribuído individualmente a ${pessoa.nome}`, "Grupo enfileirado para o agente", grupo?.nome);
  };
  const handleAssignIndividualLicense = () => {
    const lic = (entraLicencas ?? []).find((l: Row) => l.id === selectedLicencaId);
    return enqueueIndividual({ ...emptyDiff, addedLicencaIds: [selectedLicencaId] }, () => { setLicencaDialogOpen(false); setSelectedLicencaId(""); }, "atribuir_licenca_individual", `Licença "${lic?.nome}" atribuída individualmente a ${pessoa.nome}`, "Licença enfileirada para o agente", lic?.nome);
  };
  const handleAssignIndividualApp = () => {
    const app = (aplicacoes ?? []).find((a: Row) => a.id === selectedAppId);
    return enqueueIndividual({ ...emptyDiff, addedAppIds: [selectedAppId] }, () => { setAppDialogOpen(false); setSelectedAppId(""); }, "atribuir_app_individual", `App "${app?.nome}" atribuída individualmente a ${pessoa.nome}`, "Aplicação enfileirada para o agente", app?.nome);
  };
  const handleAssignIndividualSharepoint = () => {
    const pastaId = selectedSharepointPastaId === "__root__" ? null : selectedSharepointPastaId;
    const site = (sharepointSites ?? []).find((s: Row) => s.id === selectedSharepointSiteId);
    const pasta = pastaId ? (sharepointPastas ?? []).find((p: Row) => p.id === pastaId) : null;
    return enqueueIndividual({ ...emptyDiff, addedSharepointItems: [{ siteId: selectedSharepointSiteId, pastaId, permissao: selectedSharepointPermission }], removedSharepointItems: [] },
      () => { setSharepointDialogOpen(false); setSelectedSharepointSiteId(""); setSelectedSharepointPastaId("__root__"); setSelectedSharepointPermission("leitura"); },
      "atribuir_sharepoint_individual", `SharePoint "${site?.nome}" atribuído individualmente a ${pessoa.nome}`, "SharePoint enfileirado para o agente", `${site?.nome || "Site"}${pasta?.nome ? ` / ${pasta.nome}` : ""}`);
  };

  async function handleRevogarIndividual(item: Row) {
    const { data, error } = await supabase.rpc("iam_revogar_individual", { p_colaborador_id: id!, p_terceiro_id: null, p_resource_key: item.resource_key, p_motivo: `revogado por ${profile?.email || "operador"}` });
    const r = (data ?? {}) as Row;
    if (error || r.ok === false) { toast({ title: "Não foi possível revogar", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: item.requested_by === "entra_sync" ? "Remoção enfileirada (acesso importado do Entra ID)" : "Revogação enfileirada para o agente" });
  }

  const invalidatePessoa = () => {
    queryClient.invalidateQueries({ queryKey: ["colaborador", id] });
    queryClient.invalidateQueries({ queryKey: ["eventos_jml"] });
    queryClient.invalidateQueries({ queryKey: ["iam_queue"] });
    queryClient.invalidateQueries({ queryKey: ["alertas"] });
  };
  async function handleConfirmPreLeaver() {
    if (!pessoa) return;
    setSavingPreLeaver(true);
    const res = await suspendColaboradorPreventivo({ id: id!, nome: pessoa.nome, email: pessoa.email || null, sam_account_name: (pessoa as Row)?.sam_account_name || null, gestor_id: pessoa.gestor_id || null }, preLeaverMotivo, { email: profile?.email || null, nome: profile?.nome || null });
    setSavingPreLeaver(false);
    if (!res.success) { toast({ title: "Não foi possível suspender", description: res.error, variant: "destructive" }); return; }
    toast({ title: "Suspensão preventiva ativada", description: "Conta bloqueada no Entra ID e AD. Sessões revogadas.", variant: "warning" });
    setPreLeaverOpen(false); setPreLeaverMotivo(""); invalidatePessoa();
  }
  async function handleConfirmRevert() {
    if (!pessoa) return;
    setSavingPreLeaver(true);
    const res = await revertSuspensaoPreventiva({ id: id!, nome: pessoa.nome, email: pessoa.email || null, sam_account_name: (pessoa as Row)?.sam_account_name || null, gestor_id: pessoa.gestor_id || null }, preLeaverMotivo, { email: profile?.email || null, nome: profile?.nome || null });
    setSavingPreLeaver(false);
    if (!res.success) { toast({ title: "Não foi possível reverter", description: res.error, variant: "destructive" }); return; }
    toast({ title: "Suspensão revertida", description: "Conta reabilitada no Entra ID e AD.", variant: "success" });
    setRevertOpen(false); setPreLeaverMotivo(""); invalidatePessoa();
  }

  const handleSync = async () => {
    setSyncing(true);
    const res = await syncSingleUserAccess(id!);
    setSyncing(false);
    if (res.success) {
      toast({ title: "Acessos sincronizados com o Entra ID", description: res.message || `Grupos: ${res.groups}, licenças: ${res.licenses}, apps: ${res.apps} — ${res.queued} importados`, variant: "success" });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["colab_individual_queue", id] }), queryClient.invalidateQueries({ queryKey: ["iam_queue"] }), queryClient.invalidateQueries({ queryKey: ["colaborador", id] })]);
      await queryClient.refetchQueries({ queryKey: ["colab_individual_queue", id] });
    } else {
      toast({ title: "Erro na sincronização", description: res.message, variant: "destructive" });
    }
  };

  const onStatusChange = async (newStatus: string) => {
    const oldStatus = pessoa.status;
    if (newStatus === oldStatus) return;
    const result = await handleStatusChange({
      colab: { id: id!, nome: pessoa.nome, email: pessoa.email || null, sam_account_name: (pessoa as Row)?.sam_account_name || null, cargo_id: pessoa.cargo_id || null, gestor_id: pessoa.gestor_id || null, origem: pessoa.origem || null },
      oldStatus, newStatus, operadorEmail: profile?.email || null, operadorNome: profile?.nome || null,
    });
    if (!result.success) { toast({ title: result.error?.includes("exceção") ? "Exceção ativa impede desativação" : "Erro ao alterar status", description: result.error, variant: "destructive" }); return; }
    if (oldStatus === "ativo" && newStatus !== "ativo") toast({ title: "Desativação enviada ao agente", description: `${pessoa.nome} → ${COLAB_STATUS_META[newStatus]?.label ?? humanize(newStatus)}`, variant: "warning" });
    else if (oldStatus !== "ativo" && newStatus === "ativo") toast({ title: "Reativação enviada ao agente", variant: "success" });
    else toast({ title: "Status atualizado", description: COLAB_STATUS_META[newStatus]?.label ?? humanize(newStatus) });
    invalidatePessoa(); queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
  };

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-40 w-full" /><div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div><Skeleton className="h-64 w-full" /></div>;
  if (!pessoa) return <div className="py-16"><EmptyState icon={UserCircle2} title="Colaborador não encontrado" message="O registro pode ter sido removido." size="lg" action={<Button variant="outline" size="sm" asChild><Link to="/colaboradores">Voltar à lista</Link></Button>} /></div>;

  const p = pessoa as Row;
  const cargo = p.cargos?.nome || "—";
  const area = formatAreaName(p.areas?.nome);
  const empresa = p.empresas?.nome || "—";
  const localidade = p.localidades?.nome || "—";
  const gestor = p.gestor?.nome || null;
  const sc = COLAB_STATUS_META[p.status] || { label: humanize(p.status), className: "" };
  const initials = String(p.nome || "?").split(" ").filter(Boolean).map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  const suspenso = !!p.suspenso_preventivo;
  const perfisAtivos = atribuicoes?.length ?? 0;
  const diretos = individualQueue?.length ?? 0;
  const abertos = filaAberta?.length ?? 0;
  const aguardando = (filaAberta ?? []).filter((q: Row) => q.status === "waiting_approval").length;
  const admissao = p.data_admissao ? new Date(p.data_admissao + (String(p.data_admissao).length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR") : null;

  const getPerfilApps = (a: Row) => { const apps = a.perfis_acesso?.perfil_aplicacoes; return Array.isArray(apps) ? apps.map((pa: Row) => pa.aplicacoes?.nome).filter(Boolean) : []; };

  const atribuirMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Atribuir acesso<ChevronDown className="ml-1 h-3 w-3" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Vai para a fila e o Órigo Agente executa</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setAtribuirOpen(true)}><Layers className="mr-2 h-4 w-4 text-primary" />Perfil de acesso</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setGrupoDialogOpen(true)}><Shield className="mr-2 h-4 w-4" />Grupo (direto)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLicencaDialogOpen(true)}><Award className="mr-2 h-4 w-4" />Licença (direta)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAppDialogOpen(true)}><AppWindow className="mr-2 h-4 w-4" />Aplicação (direta)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setSharepointDialogOpen(true)}><FolderOpen className="mr-2 h-4 w-4" />SharePoint (direto)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-5">
      {/* ── cabeçalho da pessoa ── */}
      <Card className="overflow-hidden">
        <div className={cn("h-1.5 bg-gradient-to-r", STATUS_BAR[p.status] || STATUS_BAR.inativo)} />
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start gap-4">
            <Button variant="ghost" size="icon" className="shrink-0" asChild><Link to="/colaboradores" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold ring-2", STATUS_RING[p.status] || STATUS_RING.inativo)}>{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{p.nome}</h1>
                <Badge variant="outline" className={sc.className}>{sc.label}</Badge>
                {suspenso && <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/15 text-destructive"><ShieldAlert className="h-3 w-3" />Suspensão preventiva{p.suspenso_em ? ` desde ${new Date(p.suspenso_em).toLocaleDateString("pt-BR")}` : ""}</Badge>}
                {p.desligado_manual && <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700"><ShieldAlert className="h-3 w-3" />Desligado manualmente</Badge></span></TooltipTrigger><TooltipContent>A base do RH não reativa esta pessoa até refletir o desligamento.</TooltipContent></Tooltip>}
                {p.entra_id ? <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Badge variant="outline" className="gap-1 border-info/30 bg-info/10 text-info"><Cloud className="h-3 w-3" />Entra ID</Badge></span></TooltipTrigger><TooltipContent>Conta vinculada no Entra ID</TooltipContent></Tooltip>
                  : <Tooltip><TooltipTrigger asChild><span className="inline-flex"><Badge variant="outline" className="gap-1 border-warning/30 bg-warning/10 text-warning"><CloudOff className="h-3 w-3" />Sem conta no Entra</Badge></span></TooltipTrigger><TooltipContent>Nenhuma conta vinculada — o agente cria/vincula no próximo ciclo ou use "Sincronizar com o Entra".</TooltipContent></Tooltip>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{cargo} · {area} · {empresa}</p>
              {suspenso && p.suspenso_motivo && <p className="mt-1 text-xs text-destructive">Motivo da suspensão: {p.suspenso_motivo}</p>}
            </div>
            {canEdit && (
              <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:max-w-[420px] xl:justify-end">
                <Select value={p.status} onValueChange={onStatusChange}>
                  <SelectTrigger className="h-9 w-[150px]"><span className="text-xs text-muted-foreground">Status:&nbsp;</span><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(COLAB_STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
                {atribuirMenu}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="sm" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /><span className="ml-1 hidden sm:inline">Mais</span></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem onClick={handleSync} disabled={syncing}><RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />Sincronizar com o Entra ID</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setResetResult(null); setResetMotivo(""); setResetDialogOpen(true); }}><KeyRound className="mr-2 h-4 w-4" />Resetar senha (pelo agente)</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStartJmlOpen(true)}><Workflow className="mr-2 h-4 w-4" />Iniciar evento JML</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/colaboradores?edit=${id}`)}><Pencil className="mr-2 h-4 w-4" />Editar cadastro</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {p.status === "ativo" && !suspenso && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setPreLeaverMotivo(""); setPreLeaverOpen(true); }}><ShieldAlert className="mr-2 h-4 w-4" />Suspender acessos agora</DropdownMenuItem>}
                    {suspenso && <DropdownMenuItem className="text-success focus:text-success" onClick={() => { setPreLeaverMotivo(""); setRevertOpen(true); }}><ShieldCheck className="mr-2 h-4 w-4" />Reverter suspensão</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
                {p.status === "ativo" && !suspenso && <Button variant="destructive" size="sm" onClick={() => { setPreLeaverMotivo(""); setPreLeaverOpen(true); }}><ShieldAlert className="mr-1 h-3.5 w-3.5" />Suspender</Button>}
                {suspenso && <Button variant="outline" size="sm" className="border-success/40 text-success hover:text-success" onClick={() => { setPreLeaverMotivo(""); setRevertOpen(true); }}><ShieldCheck className="mr-1 h-3.5 w-3.5" />Reverter suspensão</Button>}
              </div>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <Fact icon={Mail} label="E-mail" value={p.email} copy />
            <Fact icon={AtSign} label="Login AD" value={p.sam_account_name} mono copy />
            <Fact icon={Hash} label="Matrícula" value={p.matricula} mono />
            <Fact icon={UserCircle2} label="Gestor" value={gestor} to={p.gestor_id ? `/colaboradores/${p.gestor_id}` : undefined} />
            <Fact icon={CalendarDays} label="Admissão" value={admissao} />
            <Fact icon={Sparkles} label="Origem" value={humanize(p.origem)} />
          </div>
        </CardContent>
      </Card>

      {/* ── resumo ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Perfis de acesso" value={perfisAtivos} icon={Layers} tone="primary" active={tab === "acessos"} onClick={() => setTab("acessos")} hint={perfisAtivos ? "ativos" : "nenhum perfil"} />
        <StatCard label="Acessos diretos" value={diretos} icon={Shield} tone="info" active={tab === "acessos"} onClick={() => setTab("acessos")} hint="grupos, licenças, apps, SharePoint" />
        <StatCard label="Na fila do agente" value={abertos} icon={ListOrdered} tone={aguardando ? "warning" : abertos ? "info" : "default"} to={`/fila-provisionamento?tab=fila&status=todos&q=${encodeURIComponent(p.email || p.nome)}`} hint={aguardando ? `${aguardando} aguardando aprovação` : abertos ? "em execução/pendentes" : "nada pendente"} />
        <StatCard label="Funções privilegiadas" value={privCount ?? 0} icon={Crown} tone={(privCount ?? 0) > 0 ? "warning" : "default"} active={tab === "privilegiados"} onClick={() => setTab("privilegiados")} hint="roles do Entra" />
        <StatCard label="Eventos JML" value={eventos.length} icon={Activity} tone="default" active={tab === "jml"} onClick={() => setTab("jml")} hint={eventos[0] ? `último: ${humanize(eventos[0].tipo)}` : "sem eventos"} />
      </div>

      {/* ── conteúdo ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="visao"><Info className="mr-1.5 h-3.5 w-3.5" />Visão geral</TabsTrigger>
          <TabsTrigger value="acessos"><Shield className="mr-1.5 h-3.5 w-3.5" />Acessos ({perfisAtivos + diretos})</TabsTrigger>
          <TabsTrigger value="privilegiados"><Crown className="mr-1.5 h-3.5 w-3.5" />Privilegiados</TabsTrigger>
          <TabsTrigger value="jml"><Workflow className="mr-1.5 h-3.5 w-3.5" />Histórico JML ({eventos.length})</TabsTrigger>
          <TabsTrigger value="atividade"><History className="mr-1.5 h-3.5 w-3.5" />Atividade</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="pt-5">
                <h3 className="mb-3 text-sm font-semibold">Dados cadastrais</h3>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                  {([
                    ["Nome completo", p.nome, UserCircle2], ["E-mail", p.email, Mail], ["CPF", p.cpf, Hash], ["Matrícula", p.matricula, Hash],
                    ["Cargo", cargo, Briefcase], ["Área", area, Layers], ["Empresa", empresa, Building2], ["Localidade", localidade, MapPin],
                    ["Gestor direto", gestor, UserCircle2], ["Data de admissão", admissao, CalendarDays], ["Origem do cadastro", humanize(p.origem), Sparkles], ["Login AD", p.sam_account_name, AtSign],
                  ] as [string, string | null | undefined, typeof Mail][]).map(([label, value, Icon]) => (
                    <div key={label} className="flex items-start gap-2">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt><dd className={cn("truncate text-sm font-medium", !value && "text-muted-foreground/60")}>{value || "—"}</dd></div>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <h3 className="mb-3 text-sm font-semibold">Identidade no diretório</h3>
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Entra ID</span>{p.entra_id ? <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Vinculado</Badge> : <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">Não vinculado</Badge>}</li>
                  <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Conta AD</span><span className="font-mono text-xs">{p.sam_account_name || "—"}</span></li>
                  <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Sessões</span>{suspenso ? <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Bloqueadas</Badge> : <Badge variant="outline">Normais</Badge>}</li>
                  <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Última importação do RH</span><span className="text-xs">{p.ultima_importacao_id ? "vinda do CSV" : "manual"}</span></li>
                  <li className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Cadastro atualizado</span><span className="text-xs">{p.updated_at ? new Date(p.updated_at).toLocaleString("pt-BR") : "—"}</span></li>
                </ul>
                {canEdit && <Button variant="outline" size="sm" className="mt-4 w-full" onClick={handleSync} disabled={syncing}><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncing && "animate-spin")} />{syncing ? "Sincronizando…" : "Sincronizar acessos com o Entra ID"}</Button>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="acessos" className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Perfis concedem grupos, licenças e apps em bloco; acessos diretos são fora de perfil. Tudo executado pelo Órigo Agente.</p>
            {canEdit && atribuirMenu}
          </div>
          <PerfisAtribuidosTable atribuicoes={atribuicoes} getPerfilApps={getPerfilApps} onRevoke={handleRevogar} />
          <IndividualAccessTabs individualQueue={individualQueue} getResourceName={(item: Row) => resolveResourceName(item)} onRevoke={handleRevogarIndividual} />
        </TabsContent>

        <TabsContent value="privilegiados" className="mt-4"><PrivilegedRolesSection colaboradorId={id!} /></TabsContent>
        <TabsContent value="jml" className="mt-4"><JMLTimeline eventos={eventos} /></TabsContent>
        <TabsContent value="atividade" className="mt-4">
          <Card><CardContent className="p-0"><ActivityFeed colaboradorId={id} limit={20} showFilters={false} emptyMessage="Nenhuma atividade registrada para esta pessoa." /></CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* ── diálogos ── */}
      <Dialog open={atribuirOpen} onOpenChange={setAtribuirOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Atribuir perfil de acesso</DialogTitle><DialogDescription>Os recursos do perfil entram na fila e o agente executa.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label>Perfil</Label>
            <Select value={selectedPerfilId} onValueChange={setSelectedPerfilId}>
              <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
              <SelectContent>
                {(perfisDisponiveis ?? []).filter((pf: Row) => pf.ativo).map((pf: Row) => { const apps = (pf.perfil_aplicacoes || []).map((pa: Row) => pa.aplicacoes?.nome).filter(Boolean); return <SelectItem key={pf.id} value={pf.id}>{pf.nome}{apps.length ? ` (${apps.join(", ")})` : ""}</SelectItem>; })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAtribuirOpen(false)}>Cancelar</Button><Button onClick={handleAtribuir} disabled={saving || !selectedPerfilId}>{saving ? "Salvando…" : "Atribuir"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grupoDialogOpen} onOpenChange={setGrupoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Grupo (acesso direto)</DialogTitle><DialogDescription>Concessão fora de perfil; aparece em "Acessos diretos" e nas revisões.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label>Grupo do Entra ID</Label>
            <Select value={selectedGrupoId} onValueChange={setSelectedGrupoId}><SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger><SelectContent>{(entraGrupos ?? []).map((g: Row) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}</SelectContent></Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setGrupoDialogOpen(false)}>Cancelar</Button><Button onClick={handleAssignIndividualGroup} disabled={savingIndividual || !selectedGrupoId}>{savingIndividual ? "Salvando…" : "Atribuir"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={licencaDialogOpen} onOpenChange={setLicencaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Licença (acesso direto)</DialogTitle><DialogDescription>Concessão fora de perfil.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label>Licença do Entra ID</Label>
            <Select value={selectedLicencaId} onValueChange={setSelectedLicencaId}><SelectTrigger><SelectValue placeholder="Selecione uma licença" /></SelectTrigger><SelectContent>{(entraLicencas ?? []).map((l: Row) => <SelectItem key={l.id} value={l.id}>{l.nome} ({l.em_uso}/{l.total})</SelectItem>)}</SelectContent></Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLicencaDialogOpen(false)}>Cancelar</Button><Button onClick={handleAssignIndividualLicense} disabled={savingIndividual || !selectedLicencaId}>{savingIndividual ? "Salvando…" : "Atribuir"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={appDialogOpen} onOpenChange={setAppDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Aplicação (acesso direto)</DialogTitle><DialogDescription>Só aplicações vinculadas ao Entra ID.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label>Aplicação</Label>
            <Select value={selectedAppId} onValueChange={setSelectedAppId}><SelectTrigger><SelectValue placeholder="Selecione uma aplicação" /></SelectTrigger><SelectContent>{(aplicacoes ?? []).filter((a: Row) => a.entra_id).map((a: Row) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent></Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAppDialogOpen(false)}>Cancelar</Button><Button onClick={handleAssignIndividualApp} disabled={savingIndividual || !selectedAppId}>{savingIndividual ? "Salvando…" : "Atribuir"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sharepointDialogOpen} onOpenChange={setSharepointDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>SharePoint (acesso direto)</DialogTitle><DialogDescription>Site inteiro ou uma pasta, com leitura ou edição.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Site</Label>
              <Select value={selectedSharepointSiteId} onValueChange={(v) => { setSelectedSharepointSiteId(v); setSelectedSharepointPastaId("__root__"); }}><SelectTrigger><SelectValue placeholder="Selecione um site" /></SelectTrigger><SelectContent>{(sharepointSites ?? []).map((s: Row) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Pasta / escopo</Label>
              <Select value={selectedSharepointPastaId} onValueChange={setSelectedSharepointPastaId} disabled={!selectedSharepointSiteId}><SelectTrigger><SelectValue placeholder="Site inteiro / raiz" /></SelectTrigger><SelectContent><SelectItem value="__root__">Site inteiro / raiz do drive</SelectItem>{(sharepointPastas ?? []).filter((pa: Row) => pa.site_db_id === selectedSharepointSiteId && pa.drive_item_id).map((pa: Row) => <SelectItem key={pa.id} value={pa.id}>{pa.caminho || pa.nome}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Permissão</Label>
              <Select value={selectedSharepointPermission} onValueChange={setSelectedSharepointPermission}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="leitura">Leitura</SelectItem><SelectItem value="edicao">Edição</SelectItem></SelectContent></Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSharepointDialogOpen(false)}>Cancelar</Button><Button onClick={handleAssignIndividualSharepoint} disabled={savingIndividual || !selectedSharepointSiteId}>{savingIndividual ? "Salvando…" : "Atribuir"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Resetar senha</DialogTitle><DialogDescription>Executado pelo Órigo Agente via fila; a senha temporária nunca fica gravada no sistema.</DialogDescription></DialogHeader>
          {resetResult ? (
            <div className="space-y-3"><p className="text-sm">{resetResult}</p><p className="text-xs text-muted-foreground">O item aparece na fila de provisionamento. A senha chega por e-mail a quem solicitou, com troca obrigatória no próximo login.</p></div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">O agente define uma senha temporária para <strong>{p.nome}</strong> (AD quando a conta é local, senão Entra ID) e envia para <strong>{profile?.email}</strong>. Com a aprovação obrigatória ligada, o item aguarda outro administrador.</p>
              <div className="space-y-1.5"><Label htmlFor="reset-motivo">Motivo (ex.: chamado GLPI)</Label><Textarea id="reset-motivo" rows={2} value={resetMotivo} onChange={(e) => setResetMotivo(e.target.value)} placeholder="Ex.: GLPI #12345 — usuário esqueceu a senha" /></div>
            </div>
          )}
          <DialogFooter>
            {resetResult ? <Button onClick={() => setResetDialogOpen(false)}>Fechar</Button> : (
              <>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancelar</Button>
                <Button disabled={resetingPassword || resetMotivo.trim().length < 3} onClick={async () => {
                  setResetingPassword(true);
                  try {
                    const { data, error } = await supabase.rpc("iam_enqueue_reset_password", { p_colaborador_id: id!, p_terceiro_id: null, p_motivo: resetMotivo.trim() });
                    const r = (data ?? {}) as Row;
                    if (error || r.ok === false) throw new Error(error?.message || r.error || "Erro ao solicitar reset");
                    setResetResult(`Reset enfileirado. A senha temporária será enviada para ${r.deliver_to} assim que o agente executar.`);
                    toast({ title: "Reset de senha enfileirado", variant: "success" });
                  } catch (err) {
                    toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
                  } finally { setResetingPassword(false); }
                }}><Bot className="mr-1 h-3.5 w-3.5" />{resetingPassword ? "Enviando…" : "Solicitar ao agente"}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={preLeaverOpen} onOpenChange={setPreLeaverOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" />Suspender acessos imediatamente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Bloqueia o sign-in de <strong>{p.nome}</strong> no Entra ID (com revogação de sessões) e desabilita a conta no AD.</p>
                <p>Licenças, grupos, perfis e aplicações <strong>permanecem</strong> — são revogados quando o Leaver formal for executado a partir do RH.</p>
                <p className="text-xs text-muted-foreground">Use enquanto a planilha do RH não reflete o desligamento. Reversível.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5"><Label htmlFor="pre-leaver-motivo">Justificativa (mín. 10 caracteres)</Label><Textarea id="pre-leaver-motivo" value={preLeaverMotivo} onChange={(e) => setPreLeaverMotivo(e.target.value)} placeholder="Ex.: desligamento confirmado pelo RH em DD/MM, aguardando atualização do CSV." rows={3} /></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPreLeaver}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={savingPreLeaver || preLeaverMotivo.trim().length < 10} onClick={(e) => { e.preventDefault(); handleConfirmPreLeaver(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{savingPreLeaver ? "Suspendendo…" : "Suspender acessos"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-success"><ShieldCheck className="h-5 w-5" />Reverter suspensão preventiva</AlertDialogTitle>
            <AlertDialogDescription asChild><div className="space-y-2 text-sm"><p>Reabilita a conta de <strong>{p.nome}</strong> no Entra ID e no AD.</p><p className="text-xs text-muted-foreground">Use só se a suspensão foi um engano. Registre o motivo.</p></div></AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5"><Label htmlFor="revert-motivo">Justificativa (mín. 10 caracteres)</Label><Textarea id="revert-motivo" value={preLeaverMotivo} onChange={(e) => setPreLeaverMotivo(e.target.value)} placeholder="Ex.: RH confirmou que o desligamento não procede." rows={3} /></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPreLeaver}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={savingPreLeaver || preLeaverMotivo.trim().length < 10} onClick={(e) => { e.preventDefault(); handleConfirmRevert(); }}>{savingPreLeaver ? "Revertendo…" : "Reverter"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StartJmlEventDialog open={startJmlOpen} onOpenChange={setStartJmlOpen} colaboradorId={id} colaboradorNome={p.nome} />
    </div>
  );
}
