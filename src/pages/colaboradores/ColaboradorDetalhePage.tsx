import { useState, useMemo } from "react";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, XCircle, Plus, KeyRound, ChevronDown, Shield, Award, AppWindow, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useColaborador, usePerfilAtribuicoes, useEventosJML, usePerfisAcesso, useEntraGrupos, useEntraLicencas, useAplicacoes, useColabIndividualQueue } from "@/hooks/useOrigoData";
import { queueFullProfileActions, generateEntraQueueForDiff } from "@/lib/entraQueueHelper";
import { handleStatusChange, syncSingleUserAccess } from "@/lib/colaboradorLifecycle";
import { suspendColaboradorPreventivo, revertSuspensaoPreventiva } from "@/lib/preLeaver";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";
import EmptyState from "@/components/EmptyState";
import { formatAreaName } from "@/lib/formatters";

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", class: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", class: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", class: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
  cargo: "bg-info/15 text-info border-info/30",
};

const origemLabels: Record<string, string> = {
  regra: "Regra",
  excecao: "Exceção",
  manual: "Manual",
  cargo: "Cargo",
};

const tipoJMLColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
  pre_leaver: "bg-warning text-warning-foreground",
  pre_leaver_revertido: "bg-info text-info-foreground",
};

const tipoJMLLabels: Record<string, string> = {
  joiner: "joiner",
  mover: "mover",
  leaver: "leaver",
  pre_leaver: "pré-leaver",
  pre_leaver_revertido: "reversão",
};

const actionTypeLabels: Record<string, string> = {
  assign_group: "Grupo",
  assign_license: "Licença",
  assign_app: "Aplicação",
};

const actionTypeIcons: Record<string, typeof Shield> = {
  assign_group: Shield,
  assign_license: Award,
  assign_app: AppWindow,
};

const statusQueueColors: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  processing: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};
function IndividualAccessTabs({ individualQueue, actionTypeIcons, actionTypeLabels, statusQueueColors, getResourceName, handleRevogarIndividual }: {
  individualQueue: any[] | undefined;
  actionTypeIcons: Record<string, typeof Shield>;
  actionTypeLabels: Record<string, string>;
  statusQueueColors: Record<string, string>;
  getResourceName: (item: any) => string;
  handleRevogarIndividual: (item: any) => void;
}) {
  const [pageLic, setPageLic] = useState(1);
  const [pageGrp, setPageGrp] = useState(1);
  const [pageApp, setPageApp] = useState(1);
  const PAGE_SIZE = 25;

  const items = individualQueue ?? [];
  const licenses = useMemo(() => items.filter((i: any) => i.action_type === "assign_license"), [items]);
  const groups = useMemo(() => items.filter((i: any) => i.action_type === "assign_group"), [items]);
  const apps = useMemo(() => items.filter((i: any) => i.action_type === "assign_app"), [items]);

  const licPage = usePagination(licenses, pageLic, PAGE_SIZE);
  const grpPage = usePagination(groups, pageGrp, PAGE_SIZE);
  const appPage = usePagination(apps, pageApp, PAGE_SIZE);

  const renderTable = (data: any[], isEntraSync: boolean = false) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="p-4 font-medium">Recurso</th>
          <th className="p-4 font-medium">Status</th>
          <th className="p-4 font-medium">Data</th>
          <th className="p-4 font-medium">Ação</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item: any) => {
          const Icon = actionTypeIcons[item.action_type] || Shield;
          const statusClass = statusQueueColors[item.status] || "";
          const imported = item.requested_by === "entra_sync";
          return (
            <tr key={item.id} className="border-b last:border-0">
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{getResourceName(item)}</span>
                </div>
              </td>
              <td className="p-4">
                <Badge variant="outline" className={statusClass}>{({ pending: "Pendente", processing: "Processando", success: "Concluído", failed: "Falhou" } as Record<string, string>)[item.status] || item.status}</Badge>
              </td>
              <td className="p-4 text-muted-foreground">{new Date(item.created_at).toLocaleDateString("pt-BR")}</td>
              <td className="p-4">
                <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => handleRevogarIndividual(item)}>
                  <XCircle className="mr-1 h-3 w-3" /> Revogar
                </Button>
              </td>
            </tr>
          );
        })}
        {data.length === 0 && (
          <tr><td colSpan={4}><EmptyState message="Nenhum registro." /></td></tr>
        )}
      </tbody>
    </table>
  );

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">Acessos Individuais</h3>
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="licencas" className="w-full">
            <div className="px-4 pt-4">
              <TabsList>
                <TabsTrigger value="licencas">Licenças ({licenses.length})</TabsTrigger>
                <TabsTrigger value="grupos">Grupos ({groups.length})</TabsTrigger>
                <TabsTrigger value="apps">Aplicações ({apps.length})</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="licencas" className="mt-0">
              {renderTable(licPage.paginatedItems)}
              <div className="px-4">
                <TablePagination totalItems={licenses.length} pageSize={PAGE_SIZE} currentPage={licPage.safePage} onPageChange={setPageLic} />
              </div>
            </TabsContent>
            <TabsContent value="grupos" className="mt-0">
              {renderTable(grpPage.paginatedItems)}
              <div className="px-4">
                <TablePagination totalItems={groups.length} pageSize={PAGE_SIZE} currentPage={grpPage.safePage} onPageChange={setPageGrp} />
              </div>
            </TabsContent>
            <TabsContent value="apps" className="mt-0">
              {renderTable(appPage.paginatedItems)}
              <div className="px-4">
                <TablePagination totalItems={apps.length} pageSize={PAGE_SIZE} currentPage={appPage.safePage} onPageChange={setPageApp} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
export default function ColaboradorDetalhePage() {
  const { id } = useParams();
  const { data: pessoa, isLoading } = useColaborador(id);
  const { data: atribuicoes } = usePerfilAtribuicoes(undefined, id);
  const { data: allEventos } = useEventosJML();
  const { data: perfisDisponiveis } = usePerfisAcesso();
  const { data: entraGrupos } = useEntraGrupos();
  const { data: entraLicencas } = useEntraLicencas();
  const { data: aplicacoes } = useAplicacoes();
  const { data: individualQueue } = useColabIndividualQueue(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  const [atribuirOpen, setAtribuirOpen] = useState(false);
  const [selectedPerfilId, setSelectedPerfilId] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetingPassword, setResetingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  // Individual assignment dialogs
  const [grupoDialogOpen, setGrupoDialogOpen] = useState(false);
  const [licencaDialogOpen, setLicencaDialogOpen] = useState(false);
  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [selectedGrupoId, setSelectedGrupoId] = useState("");
  const [selectedLicencaId, setSelectedLicencaId] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [savingIndividual, setSavingIndividual] = useState(false);

  // Pre-Leaver (suspensão preventiva)
  const [preLeaverOpen, setPreLeaverOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [preLeaverMotivo, setPreLeaverMotivo] = useState("");
  const [savingPreLeaver, setSavingPreLeaver] = useState(false);

  const eventos = (allEventos ?? []).filter((e) => e.colaborador_id === id);

  function getColabIdentity() {
    return {
      id: id!,
      nome: pessoa.nome,
      email: pessoa.email || null,
      sam_account_name: (pessoa as any)?.sam_account_name || null,
    };
  }

  async function handleAtribuir() {
    if (!selectedPerfilId || !id) return;
    setSaving(true);
    const { error } = await supabase.from("perfil_atribuicoes").insert({
      perfil_id: selectedPerfilId,
      colaborador_id: id,
      origem: "manual",
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao atribuir", description: error.message, variant: "destructive" }); return; }

    const identity = pessoa?.email || (pessoa as any)?.sam_account_name || "";
    if (identity) {
      await queueFullProfileActions([getColabIdentity()], [selectedPerfilId], "assign");
    }

    toast({ title: "Perfil atribuído com sucesso" });
    await logAuditoria({ acao: "atribuir_perfil", entidade: "perfil_atribuicoes", entidade_id: id!, resumo: `Perfil atribuído manualmente a ${pessoa.nome}`, operador: profile?.email });
    queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
    setAtribuirOpen(false);
    setSelectedPerfilId("");
  }

  async function handleRevogar(atribuicaoId: string, perfilId?: string) {
    const { error } = await supabase.from("perfil_atribuicoes").update({
      ativo: false,
      data_revogacao: new Date().toISOString(),
    }).eq("id", atribuicaoId);
    if (error) { toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" }); return; }

    const identity = pessoa?.email || (pessoa as any)?.sam_account_name || "";
    if (identity && perfilId) {
      await queueFullProfileActions([getColabIdentity()], [perfilId], "remove");
    }

    toast({ title: "Acesso revogado" });
    await logAuditoria({ acao: "revogar_perfil", entidade: "perfil_atribuicoes", entidade_id: id!, resumo: `Perfil revogado de ${pessoa.nome}`, operador: profile?.email });
    queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
  }

  async function handleAssignIndividualGroup() {
    if (!selectedGrupoId || !id) return;
    setSavingIndividual(true);
    try {
      await generateEntraQueueForDiff(
        [getColabIdentity()],
        { addedGrupoIds: [selectedGrupoId], removedGrupoIds: [], addedLicencaIds: [], removedLicencaIds: [], addedAppIds: [], removedAppIds: [] },
      );
      // Mark as manual_individual
      const { data: latest } = await (supabase as any).from("iam_queue")
        .select("id").eq("colaborador_id", id).eq("action_type", "assign_group").eq("requested_by", "sistema")
        .order("created_at", { ascending: false }).limit(1);
      if (latest?.[0]) {
        await (supabase as any).from("iam_queue").update({ requested_by: "manual_individual" }).eq("id", latest[0].id);
      }
      const grupo = (entraGrupos ?? []).find((g: any) => g.id === selectedGrupoId);
      toast({ title: "Grupo atribuído", description: grupo?.nome });
      await logAuditoria({ acao: "atribuir_grupo_individual", entidade: "iam_queue", entidade_id: id!, resumo: `Grupo "${grupo?.nome}" atribuído individualmente a ${pessoa.nome}`, operador: profile?.email });
      queryClient.invalidateQueries({ queryKey: ["colab_individual_queue"] });
      setGrupoDialogOpen(false);
      setSelectedGrupoId("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingIndividual(false);
    }
  }

  async function handleAssignIndividualLicense() {
    if (!selectedLicencaId || !id) return;
    setSavingIndividual(true);
    try {
      await generateEntraQueueForDiff(
        [getColabIdentity()],
        { addedGrupoIds: [], removedGrupoIds: [], addedLicencaIds: [selectedLicencaId], removedLicencaIds: [], addedAppIds: [], removedAppIds: [] },
      );
      const { data: latest } = await (supabase as any).from("iam_queue")
        .select("id").eq("colaborador_id", id).eq("action_type", "assign_license").eq("requested_by", "sistema")
        .order("created_at", { ascending: false }).limit(1);
      if (latest?.[0]) {
        await (supabase as any).from("iam_queue").update({ requested_by: "manual_individual" }).eq("id", latest[0].id);
      }
      const lic = (entraLicencas ?? []).find((l: any) => l.id === selectedLicencaId);
      toast({ title: "Licença atribuída", description: lic?.nome });
      await logAuditoria({ acao: "atribuir_licenca_individual", entidade: "iam_queue", entidade_id: id!, resumo: `Licença "${lic?.nome}" atribuída individualmente a ${pessoa.nome}`, operador: profile?.email });
      queryClient.invalidateQueries({ queryKey: ["colab_individual_queue"] });
      setLicencaDialogOpen(false);
      setSelectedLicencaId("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingIndividual(false);
    }
  }

  async function handleAssignIndividualApp() {
    if (!selectedAppId || !id) return;
    setSavingIndividual(true);
    try {
      await generateEntraQueueForDiff(
        [getColabIdentity()],
        { addedGrupoIds: [], removedGrupoIds: [], addedLicencaIds: [], removedLicencaIds: [], addedAppIds: [selectedAppId], removedAppIds: [] },
      );
      const { data: latest } = await (supabase as any).from("iam_queue")
        .select("id").eq("colaborador_id", id).eq("action_type", "assign_app").eq("requested_by", "sistema")
        .order("created_at", { ascending: false }).limit(1);
      if (latest?.[0]) {
        await (supabase as any).from("iam_queue").update({ requested_by: "manual_individual" }).eq("id", latest[0].id);
      }
      const app = (aplicacoes ?? []).find((a: any) => a.id === selectedAppId);
      toast({ title: "Aplicação atribuída", description: app?.nome });
      await logAuditoria({ acao: "atribuir_app_individual", entidade: "iam_queue", entidade_id: id!, resumo: `App "${app?.nome}" atribuída individualmente a ${pessoa.nome}`, operador: profile?.email });
      queryClient.invalidateQueries({ queryKey: ["colab_individual_queue"] });
      setAppDialogOpen(false);
      setSelectedAppId("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSavingIndividual(false);
    }
  }

  async function handleRevogarIndividual(item: any) {
    const reverseMap: Record<string, string> = {
      assign_group: "remove_group",
      assign_license: "remove_license",
      assign_app: "remove_app",
    };
    const reverseAction = reverseMap[item.action_type];
    if (!reverseAction) return;

    const payload = { ...item.payload_json };
    const { error } = await supabase.from("iam_queue" as any).insert({
      action_type: reverseAction,
      payload_json: payload,
      requested_by: "manual_individual",
      colaborador_id: id,
      target_identity: item.target_identity,
      status: "pending",
    });
    if (error) { toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Revogação enviada para processamento" });
    const resourceName = payload.groupName || payload.licenseName || payload.appName || "";
    await logAuditoria({ acao: "revogar_individual", entidade: "iam_queue", entidade_id: id!, resumo: `Recurso individual "${resourceName}" revogado de ${pessoa.nome}`, operador: profile?.email });
    triggerEntraProcessing();
    queryClient.invalidateQueries({ queryKey: ["colab_individual_queue"] });
  }

  async function handleConfirmPreLeaver() {
    if (!pessoa) return;
    setSavingPreLeaver(true);
    const res = await suspendColaboradorPreventivo(
      {
        id: id!,
        nome: pessoa.nome,
        email: pessoa.email || null,
        sam_account_name: (pessoa as any)?.sam_account_name || null,
        gestor_id: pessoa.gestor_id || null,
      },
      preLeaverMotivo,
      { email: profile?.email || null, nome: profile?.nome || null },
    );
    setSavingPreLeaver(false);
    if (!res.success) {
      toast({ title: "Não foi possível suspender", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: "Suspensão preventiva ativada", description: "Conta bloqueada no Entra ID e AD. Sessões revogadas." });
    setPreLeaverOpen(false);
    setPreLeaverMotivo("");
    queryClient.invalidateQueries({ queryKey: ["colaborador", id] });
    queryClient.invalidateQueries({ queryKey: ["eventos_jml"] });
    queryClient.invalidateQueries({ queryKey: ["iam_queue"] });
    queryClient.invalidateQueries({ queryKey: ["alertas"] });
  }

  async function handleConfirmRevert() {
    if (!pessoa) return;
    setSavingPreLeaver(true);
    const res = await revertSuspensaoPreventiva(
      {
        id: id!,
        nome: pessoa.nome,
        email: pessoa.email || null,
        sam_account_name: (pessoa as any)?.sam_account_name || null,
        gestor_id: pessoa.gestor_id || null,
      },
      preLeaverMotivo,
      { email: profile?.email || null, nome: profile?.nome || null },
    );
    setSavingPreLeaver(false);
    if (!res.success) {
      toast({ title: "Não foi possível reverter", description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: "Suspensão revertida", description: "Conta reabilitada no Entra ID e AD." });
    setRevertOpen(false);
    setPreLeaverMotivo("");
    queryClient.invalidateQueries({ queryKey: ["colaborador", id] });
    queryClient.invalidateQueries({ queryKey: ["eventos_jml"] });
    queryClient.invalidateQueries({ queryKey: ["iam_queue"] });
    queryClient.invalidateQueries({ queryKey: ["alertas"] });
  }

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!pessoa) return <div className="p-8 text-center text-muted-foreground">Colaborador não encontrado.</div>;

  const cargo = (pessoa.cargos as any)?.nome || "—";
  const area = formatAreaName((pessoa.areas as any)?.nome);
  const empresa = (pessoa.empresas as any)?.nome || "—";
  const localidade = (pessoa.localidades as any)?.nome || "—";
  const gestor = (pessoa as any)?.gestor?.nome || "—";
  const sc = statusConfig[pessoa.status] || { label: pessoa.status, class: "" };

  const getPerfilApps = (a: any) => {
    const apps = (a.perfis_acesso as any)?.perfil_aplicacoes;
    if (!apps || !Array.isArray(apps)) return [];
    return apps.map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
  };

  const getResourceName = (item: any) => {
    const p = item.payload_json || {};
    return p.groupName || p.licenseName || p.appName || "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/colaboradores"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{pessoa.nome}</h1>
            <Badge variant="outline" className={sc.class}>{sc.label}</Badge>
            {(pessoa as any)?.suspenso_preventivo && (
              <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 gap-1">
                <ShieldAlert className="h-3 w-3" />
                Suspensão Preventiva — desde {(pessoa as any).suspenso_em ? new Date((pessoa as any).suspenso_em).toLocaleDateString("pt-BR") : "—"}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{cargo} · {area} · {empresa}</p>
          {(pessoa as any)?.suspenso_preventivo && (pessoa as any)?.suspenso_motivo && (
            <p className="text-xs text-destructive mt-1">Motivo: {(pessoa as any).suspenso_motivo}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Select
            value={pessoa.status}
            onValueChange={async (newStatus) => {
              const oldStatus = pessoa.status;

              const result = await handleStatusChange({
                colab: {
                  id: id!,
                  nome: pessoa.nome,
                  email: pessoa.email || null,
                  sam_account_name: (pessoa as any)?.sam_account_name || null,
                  cargo_id: pessoa.cargo_id || null,
                  gestor_id: pessoa.gestor_id || null,
                  origem: pessoa.origem || null,
                },
                oldStatus,
                newStatus,
                operadorEmail: profile?.email || null,
                operadorNome: profile?.nome || null,
              });

              if (!result.success) {
                toast({ title: result.error?.includes("exceção") ? "Exceção ativa impede desativação" : "Erro ao alterar status", description: result.error, variant: "destructive" });
                return;
              }

              if (oldStatus === "ativo" && newStatus !== "ativo") {
                toast({ title: "Solicitação de desativação enviada para processamento" });
              } else if (oldStatus !== "ativo" && newStatus === "ativo") {
                toast({ title: "Solicitação de reativação enviada para processamento" });
              }

              queryClient.invalidateQueries({ queryKey: ["colaborador", id] });
              queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
              queryClient.invalidateQueries({ queryKey: ["eventos_jml"] });
              queryClient.invalidateQueries({ queryKey: ["iam_queue"] });
            }}
          >
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="ferias">Férias</SelectItem>
              <SelectItem value="afastado">Afastado</SelectItem>
              <SelectItem value="desligado">Desligado</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={async () => {
            toast({ title: "Sincronizando acessos do Entra ID..." });
            const res = await syncSingleUserAccess(id!);
            if (res.success) {
              const msg = res.message || `Grupos: ${res.groups}, Licenças: ${res.licenses}, Apps: ${res.apps} — ${res.queued} importados`;
              toast({ title: "Sincronização concluída", description: msg });
              queryClient.invalidateQueries({ queryKey: ["iam_queue"] });
              queryClient.invalidateQueries({ queryKey: ["colaborador", id] });
            } else {
              toast({ title: "Erro na sincronização", description: res.message, variant: "destructive" });
            }
          }}>
            <RefreshCw className="mr-1 h-3 w-3" /> Sync Entra
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setTempPassword(null); setResetDialogOpen(true); }}>
            <KeyRound className="mr-1 h-3 w-3" /> Resetar Senha
          </Button>
          <Button variant="outline" size="sm" onClick={() => { window.location.href = `/colaboradores?edit=${id}`; }}>
            <Pencil className="mr-1 h-3 w-3" /> Editar
          </Button>
          {pessoa.status === "ativo" && !(pessoa as any)?.suspenso_preventivo && (
            <Button variant="destructive" size="sm" onClick={() => { setPreLeaverMotivo(""); setPreLeaverOpen(true); }}>
              <ShieldAlert className="mr-1 h-3 w-3" /> Suspender Acessos
            </Button>
          )}
          {(pessoa as any)?.suspenso_preventivo && (
            <Button variant="outline" size="sm" className="border-success/40 text-success hover:text-success" onClick={() => { setPreLeaverMotivo(""); setRevertOpen(true); }}>
              <ShieldCheck className="mr-1 h-3 w-3" /> Reverter Suspensão
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="acessos">Acessos Ativos ({(atribuicoes?.length ?? 0) + (individualQueue?.length ?? 0)})</TabsTrigger>
          <TabsTrigger value="jml">Histórico JML ({eventos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Nome completo", pessoa.nome],
                  ["Email", pessoa.email || "—"],
                  ["CPF", pessoa.cpf || "—"],
                  ["Matrícula", pessoa.matricula || "—"],
                  ["Cargo", cargo],
                  ["Área", area],
                  ["Empresa", empresa],
                  ["Localidade", localidade],
                  ["Gestor", gestor],
                  ["Data admissão", pessoa.data_admissao ? new Date(pessoa.data_admissao).toLocaleDateString("pt-BR") : "—"],
                  ["Origem", pessoa.origem === "csv" ? "CSV" : pessoa.origem === "entra_id" ? "Entra ID" : pessoa.origem === "manual" ? "Manual" : pessoa.origem || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acessos" className="mt-4 space-y-6">
          {/* Dropdown button */}
          <div className="flex justify-end mb-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-3.5 w-3.5" /> Atribuir <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAtribuirOpen(true)}>
                  <Shield className="mr-2 h-4 w-4" /> Perfil de Acesso
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGrupoDialogOpen(true)}>
                  <Shield className="mr-2 h-4 w-4" /> Grupo (individual)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLicencaDialogOpen(true)}>
                  <Award className="mr-2 h-4 w-4" /> Licença (individual)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAppDialogOpen(true)}>
                  <AppWindow className="mr-2 h-4 w-4" /> Aplicação (individual)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Perfis table */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Perfis de Acesso</h3>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-4 font-medium">Perfil</th>
                      <th className="p-4 font-medium">Aplicações</th>
                      <th className="p-4 font-medium">Origem</th>
                      <th className="p-4 font-medium">Desde</th>
                      <th className="p-4 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(atribuicoes ?? []).map((a) => {
                      const apps = getPerfilApps(a);
                      return (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="p-4 font-medium">{(a.perfis_acesso as any)?.nome || "—"}</td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {apps.length > 0 ? apps.map((name: string) => (
                                <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                              )) : <span className="text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className={origemColors[a.origem || "manual"]}>
                              {origemLabels[a.origem || "manual"] || a.origem}
                            </Badge>
                          </td>
                          <td className="p-4 text-muted-foreground">{new Date(a.data_concessao).toLocaleDateString("pt-BR")}</td>
                          <td className="p-4">
                            <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => handleRevogar(a.id, a.perfil_id)}>
                              <XCircle className="mr-1 h-3 w-3" /> Revogar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {(!atribuicoes || atribuicoes.length === 0) && (
                      <tr><td colSpan={5}><EmptyState message="Nenhum perfil atribuído." /></td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Individual assignments - tabs */}
          <IndividualAccessTabs
            individualQueue={individualQueue}
            actionTypeIcons={actionTypeIcons}
            actionTypeLabels={actionTypeLabels}
            statusQueueColors={statusQueueColors}
            getResourceName={getResourceName}
            handleRevogarIndividual={handleRevogarIndividual}
          />
        </TabsContent>

        <TabsContent value="jml" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {eventos.length === 0 ? (
                <EmptyState message="Nenhum evento JML." />
              ) : (
                <div className="relative border-l-2 border-border pl-6 space-y-6">
                  {eventos.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-card">
                        <div className={`h-2.5 w-2.5 rounded-full ${ev.tipo === "joiner" ? "bg-success" : ev.tipo === "mover" ? "bg-info" : "bg-destructive"}`} />
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${tipoJMLColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo}</Badge>
                            <Badge variant="outline" className="text-[10px]">{({ pendente: "Pendente", quarentena: "Quarentena", executando: "Executando", executado: "Executado", erro: "Erro", cancelado: "Cancelado" } as Record<string, string>)[ev.status] || ev.status}</Badge>
                          </div>
                          <p className="text-sm">
                            {ev.dados_depois ? JSON.stringify(ev.dados_depois) : ev.dados_antes ? JSON.stringify(ev.dados_antes) : "Evento processado"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-4">{new Date(ev.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Atribuir Perfil */}
      <Dialog open={atribuirOpen} onOpenChange={setAtribuirOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Atribuir Perfil de Acesso</DialogTitle></DialogHeader>
          <div>
            <Label>Perfil de Acesso</Label>
            <Select value={selectedPerfilId} onValueChange={setSelectedPerfilId}>
              <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
              <SelectContent>
                {(perfisDisponiveis ?? []).filter((p: any) => p.ativo).map((p: any) => {
                  const apps = (p.perfil_aplicacoes || []).map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
                  return <SelectItem key={p.id} value={p.id}>{p.nome} {apps.length > 0 ? `(${apps.join(", ")})` : ""}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtribuirOpen(false)}>Cancelar</Button>
            <Button onClick={handleAtribuir} disabled={saving || !selectedPerfilId}>{saving ? "Salvando..." : "Atribuir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Adicionar Grupo */}
      <Dialog open={grupoDialogOpen} onOpenChange={setGrupoDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Grupo (Individual)</DialogTitle></DialogHeader>
          <div>
            <Label>Grupo Entra ID</Label>
            <Select value={selectedGrupoId} onValueChange={setSelectedGrupoId}>
              <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
              <SelectContent>
                {(entraGrupos ?? []).map((g: any) => (
                  <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrupoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssignIndividualGroup} disabled={savingIndividual || !selectedGrupoId}>{savingIndividual ? "Salvando..." : "Atribuir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Adicionar Licença */}
      <Dialog open={licencaDialogOpen} onOpenChange={setLicencaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Licença (Individual)</DialogTitle></DialogHeader>
          <div>
            <Label>Licença Entra ID</Label>
            <Select value={selectedLicencaId} onValueChange={setSelectedLicencaId}>
              <SelectTrigger><SelectValue placeholder="Selecione uma licença" /></SelectTrigger>
              <SelectContent>
                {(entraLicencas ?? []).map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome} ({l.em_uso}/{l.total})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLicencaDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssignIndividualLicense} disabled={savingIndividual || !selectedLicencaId}>{savingIndividual ? "Salvando..." : "Atribuir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Adicionar App */}
      <Dialog open={appDialogOpen} onOpenChange={setAppDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Aplicação (Individual)</DialogTitle></DialogHeader>
          <div>
            <Label>Aplicação</Label>
            <Select value={selectedAppId} onValueChange={setSelectedAppId}>
              <SelectTrigger><SelectValue placeholder="Selecione uma aplicação" /></SelectTrigger>
              <SelectContent>
                {(aplicacoes ?? []).filter((a: any) => a.entra_id).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAppDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssignIndividualApp} disabled={savingIndividual || !selectedAppId}>{savingIndividual ? "Salvando..." : "Atribuir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Reset Password */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Resetar Senha — Entra ID</DialogTitle></DialogHeader>
          {tempPassword ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Senha temporária gerada com sucesso. O usuário precisará alterá-la no próximo login.</p>
              <div className="bg-muted p-3 rounded-md font-mono text-sm text-center select-all">{tempPassword}</div>
              <p className="text-xs text-muted-foreground">Copie e envie ao colaborador de forma segura.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Uma senha temporária será gerada e o usuário <strong>{pessoa.nome}</strong> será obrigado a alterá-la no próximo login no Entra ID.
            </p>
          )}
          <DialogFooter>
            {tempPassword ? (
              <Button onClick={() => setResetDialogOpen(false)}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)}>Cancelar</Button>
                <Button
                  disabled={resetingPassword}
                  onClick={async () => {
                    setResetingPassword(true);
                    try {
                      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-entra-password`;
                      const res = await fetch(url, {
                        method: "POST",
                        headers: {
                          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ colaborador_id: id }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Erro ao resetar senha");
                      setTempPassword(data.tempPassword);
                      toast({ title: "Senha resetada com sucesso" });
                      await logAuditoria({ acao: "reset_senha_entra", entidade: "colaboradores", entidade_id: id!, resumo: `Senha resetada no Entra ID para ${pessoa.nome}`, operador: profile?.email });
                    } catch (err: any) {
                      toast({ title: "Erro", description: err.message, variant: "destructive" });
                    } finally {
                      setResetingPassword(false);
                    }
                  }}
                >
                  {resetingPassword ? "Resetando..." : "Confirmar Reset"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog — Suspender Acessos (Pré-Desligamento) */}
      <AlertDialog open={preLeaverOpen} onOpenChange={setPreLeaverOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Suspender acessos imediatamente
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Esta ação bloqueia o sign-in de <strong>{pessoa.nome}</strong> no Entra ID
                  (incluindo revogação de sessões ativas) e desabilita a conta no AD on-prem.
                </p>
                <p>
                  Licenças, grupos, perfis e aplicações <strong>permanecem</strong> atribuídos —
                  serão revogados automaticamente quando o Leaver formal for executado a partir do CSV.
                </p>
                <p className="text-xs text-muted-foreground">
                  Use enquanto aguardamos a planilha do RH refletir o desligamento. A ação é reversível.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pre-leaver-motivo">Justificativa (mín. 10 caracteres)</Label>
            <Textarea
              id="pre-leaver-motivo"
              value={preLeaverMotivo}
              onChange={(e) => setPreLeaverMotivo(e.target.value)}
              placeholder="Ex.: desligamento confirmado pelo RH em DD/MM, aguardando atualização do CSV."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPreLeaver}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingPreLeaver || preLeaverMotivo.trim().length < 10}
              onClick={(e) => { e.preventDefault(); handleConfirmPreLeaver(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {savingPreLeaver ? "Suspendendo..." : "Suspender acessos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog — Reverter Suspensão */}
      <AlertDialog open={revertOpen} onOpenChange={setRevertOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-success">
              <ShieldCheck className="h-5 w-5" />
              Reverter suspensão preventiva
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Esta ação reabilita a conta de <strong>{pessoa.nome}</strong> no Entra ID e no AD on-prem.
                </p>
                <p className="text-xs text-muted-foreground">
                  Use apenas se a suspensão foi um engano. Registre o motivo da reversão.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revert-motivo">Justificativa (mín. 10 caracteres)</Label>
            <Textarea
              id="revert-motivo"
              value={preLeaverMotivo}
              onChange={(e) => setPreLeaverMotivo(e.target.value)}
              placeholder="Ex.: RH confirmou que o desligamento não procede."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPreLeaver}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={savingPreLeaver || preLeaverMotivo.trim().length < 10}
              onClick={(e) => { e.preventDefault(); handleConfirmRevert(); }}
            >
              {savingPreLeaver ? "Revertendo..." : "Reverter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
