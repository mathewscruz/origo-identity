import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Upload, Plus, Pencil, Trash2, AlertTriangle, MoreHorizontal, Shield, Key, Monitor, RefreshCw } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import ColaboradorActivityPopover from "@/components/ColaboradorActivityPopover";
import { useColaboradores, useEmpresas, useAreas, useCargos, useLocalidades, useEntraGrupos, useEntraLicencas, useAplicacoes } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { provisionCargoAcessos } from "@/lib/provisionCargoAcessos";
import { createEventoJML } from "@/lib/createEventoJML";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";
import EmptyState from "@/components/EmptyState";
import SortableHeader, { SortDirection, useSortableData } from "@/components/SortableHeader";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", class: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", class: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", class: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

const statusOptions = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "ferias", label: "Férias" },
  { value: "afastado", label: "Afastado" },
  { value: "desligado", label: "Desligado" },
];

interface ColabForm {
  nome: string;
  email: string;
  cpf: string;
  matricula: string;
  sam_account_name: string;
  status: string;
  empresa_id: string;
  area_id: string;
  cargo_id: string;
  localidade_id: string;
  data_admissao: string;
}

const emptyForm: ColabForm = {
  nome: "", email: "", cpf: "", matricula: "", sam_account_name: "", status: "ativo",
  empresa_id: "", area_id: "", cargo_id: "", localidade_id: "", data_admissao: "",
};

export default function ColaboradoresPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [cargoFilter, setCargoFilter] = useState("todos");
  const [areaFilter, setAreaFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCargoId, setEditingCargoId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingOrigem, setEditingOrigem] = useState<string | null>(null);
  const [form, setForm] = useState<ColabForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { data: colaboradores, isLoading } = useColaboradores();
  const { data: empresas } = useEmpresas();
  const { data: areas } = useAreas();
  const { data: cargos } = useCargos();
  const { data: localidades } = useLocalidades();
  const { data: entraGrupos } = useEntraGrupos();
  const { data: entraLicencas } = useEntraLicencas();
  const { data: aplicacoes } = useAplicacoes();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  // Auto-generate email and sam_account_name when name changes (new collaborators only)
  useEffect(() => {
    if (editingId) return;
    const nome = form.nome.trim();
    if (!nome) {
      setForm(prev => ({ ...prev, email: "", sam_account_name: "" }));
      return;
    }
    const parts = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/).filter(p => !["de","da","do","dos","das","e"].includes(p) && p.length > 0);
    if (parts.length === 0) return;
    const first = parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : first;
    const sam = `${first}.${last}`;
    const email = `${sam}@origoenergia.com.br`;
    setForm(prev => ({ ...prev, email, sam_account_name: sam }));
  }, [form.nome, editingId]);

  // Quick-assign individual resource state
  const [quickAssignColab, setQuickAssignColab] = useState<any>(null);
  const [quickAssignType, setQuickAssignType] = useState<"grupo" | "licenca" | "app" | null>(null);
  const [quickAssignValue, setQuickAssignValue] = useState("");

  const mapped = (colaboradores ?? []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    email: c.email || "",
    cpf: c.cpf ? `***${c.cpf.slice(-6)}` : "—",
    cpf_raw: c.cpf || "",
    cargo: c.cargos?.nome || "—",
    cargo_id: c.cargo_id || "",
    area: c.areas?.nome || "—",
    area_id: c.area_id || "",
    empresa_id: c.empresa_id || "",
    localidade_id: c.localidade_id || "",
    matricula: c.matricula || "",
    sam_account_name: c.sam_account_name || "",
    data_admissao: c.data_admissao || "",
    status: c.status,
    origem: c.origem || "manual",
  }));

  const filtered = mapped.filter((c) => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.email.toLowerCase().includes(busca.toLowerCase())) return false;
    if (statusFilter !== "todos" && c.status !== statusFilter) return false;
    if (areaFilter !== "todos" && c.area !== areaFilter) return false;
    if (cargoFilter !== "todos" && c.cargo !== cargoFilter) return false;
    return true;
  });

  const sorted = useSortableData(filtered, sortField, sortDir);
  const { paginatedItems, safePage } = usePagination(sorted, page, pageSize);
  const areasList = [...new Set(mapped.map((c) => c.area).filter((a) => a !== "—"))];
  const cargosList = [...new Set(mapped.map((c) => c.cargo).filter((c) => c !== "—"))];

  function openNew() {
    setEditingId(null);
    setEditingCargoId(null);
    setEditingStatus(null);
    setEditingAreaId(null);
    setEditingOrigem(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: typeof mapped[0]) {
    setEditingId(c.id);
    setEditingCargoId(c.cargo_id || null);
    setEditingStatus(c.status);
    setEditingAreaId(c.area_id || null);
    setEditingOrigem(c.origem);
    setForm({
      nome: c.nome, email: c.email, cpf: c.cpf_raw, matricula: c.matricula,
      sam_account_name: c.sam_account_name || "",
      status: c.status, empresa_id: c.empresa_id, area_id: c.area_id,
      cargo_id: c.cargo_id, localidade_id: c.localidade_id, data_admissao: c.data_admissao,
    });
    setDialogOpen(true);
  }

  // Helper to look up names for payload
  function getNameById(list: any[] | undefined, id: string) {
    return list?.find((i: any) => i.id === id)?.nome || "";
  }

  async function handleSave() {
    if (!form.nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    setSaving(true);
    const payload: any = {
      nome: form.nome.trim(),
      email: form.email.trim() || null,
      cpf: form.cpf.trim() || null,
      matricula: form.matricula.trim() || null,
      sam_account_name: form.sam_account_name.trim() || null,
      status: form.status as any,
      empresa_id: form.empresa_id || null,
      area_id: form.area_id || null,
      cargo_id: form.cargo_id || null,
      localidade_id: form.localidade_id || null,
      data_admissao: form.data_admissao || null,
      origem: "manual",
    };

    let colaboradorId = editingId;
    let error;

    if (editingId) {
      ({ error } = await supabase.from("colaboradores").update(payload).eq("id", editingId));
    } else {
      const res = await supabase.from("colaboradores").insert(payload).select("id").single();
      error = res.error;
      colaboradorId = res.data?.id || null;
    }
    
    if (error) { setSaving(false); toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }

    // --- Lifecycle only for manual collaborators ---
    const isManual = !editingId || editingOrigem === "manual";
    
    if (isManual && colaboradorId) {
      const cargoChanged = form.cargo_id !== (editingCargoId || "");
      const areaChanged = form.area_id !== (editingAreaId || "");
      const statusChanged = editingId ? form.status !== editingStatus : false;
      const becameInactive = statusChanged && editingStatus === "ativo" && form.status !== "ativo";
      const becameActive = statusChanged && editingStatus !== "ativo" && form.status === "ativo";

      // 1. Provision cargo access profiles
      if (cargoChanged || !editingId || becameActive) {
        const result = await provisionCargoAcessos(colaboradorId, form.cargo_id || null, editingId ? (editingCargoId || null) : null);
        if (result.skippedDirectory) {
          toast({ title: "⚠️ Provisionamento de diretório ignorado", description: "O campo 'Nome de login AD' está vazio. Grupos e licenças não serão atribuídos no Entra ID.", variant: "destructive" });
        }
        if (result.provisioned > 0 || result.revoked > 0) {
          toast({ title: `Acessos atualizados: ${result.provisioned} concedido(s), ${result.revoked} revogado(s)` });
        }
      }

      // 2. Queue disable/enable requests
      if (becameInactive) {
        const sam = form.sam_account_name.trim();
        await supabase.from("iam_queue" as any).insert({
          action_type: "disable",
          payload_json: {
            samAccountName: sam,
            mail: form.email.trim() || null,
            displayName: form.nome.trim(),
            status: "disabled",
            status_anterior: editingStatus || "ativo",
            status_novo: form.status,
            changed_fields: ["status"],
            new_values: { status: "disabled" },
          },
          requested_by: profile?.email || "sistema",
          colaborador_id: colaboradorId,
          target_identity: sam || null,
        });
        // Also disable in Entra ID simultaneously
        const entraIdentityDisable = form.email.trim() || sam;
        if (entraIdentityDisable) {
          await supabase.from("iam_queue" as any).insert({
            action_type: "disable_entra",
            payload_json: { mail: form.email.trim() || null, samAccountName: sam, displayName: form.nome.trim() },
            requested_by: profile?.email || "sistema",
            colaborador_id: colaboradorId,
            target_identity: entraIdentityDisable,
          });
        }
        toast({ title: "Solicitação de desativação enviada para processamento" });
      } else if (becameActive) {
        const sam = form.sam_account_name.trim();
        await supabase.from("iam_queue" as any).insert({
          action_type: "update",
          payload_json: {
            samAccountName: sam,
            mail: form.email.trim() || null,
            displayName: form.nome.trim(),
            status: "enabled",
            status_anterior: editingStatus || "inativo",
            status_novo: "ativo",
            changed_fields: ["status"],
            new_values: { status: "enabled" },
          },
          requested_by: profile?.email || "sistema",
          colaborador_id: colaboradorId,
          target_identity: sam || null,
        });
        // Also enable in Entra ID simultaneously
        const entraIdentity = form.email.trim() || sam;
        if (entraIdentity) {
          await supabase.from("iam_queue" as any).insert({
            action_type: "enable_entra",
            payload_json: { mail: form.email.trim() || null, samAccountName: sam, displayName: form.nome.trim() },
            requested_by: profile?.email || "sistema",
            colaborador_id: colaboradorId,
            target_identity: entraIdentity,
          });
        }
        toast({ title: "Solicitação de reativação enviada para processamento" });

        // Re-provision cargo access
        if (form.cargo_id) {
          await provisionCargoAcessos(colaboradorId, form.cargo_id, null);
        }
      }

      // 3. Queue create request for new collaborators
      if (!editingId && form.status === "ativo") {
        const nameParts = form.nome.trim().split(" ");
        const givenName = nameParts[0] || "";
        const surname = nameParts.slice(1).join(" ") || givenName;
        const sam = form.sam_account_name.trim();

        await supabase.from("iam_queue" as any).insert({
          action_type: "create",
          payload_json: {
            givenName,
            surname,
            displayName: form.nome.trim(),
            samAccountName: sam,
            userPrincipalName: `${sam}@ebessolar.local`,
            mail: form.email.trim() || null,
            department: getNameById(areas, form.area_id),
            title: getNameById(cargos, form.cargo_id),
            manager: null,
            company: getNameById(empresas, form.empresa_id),
            telephoneNumber: null,
            ouPath: "",
          },
          requested_by: profile?.email || "sistema",
          colaborador_id: colaboradorId,
          target_identity: sam || null,
        });
        toast({ title: "Solicitação enviada para processamento" });

        // Sync current Entra ID access as individual records
        if (form.email.trim() || form.sam_account_name.trim()) {
          try {
            const syncUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-user-access`;
            fetch(syncUrl, {
              method: "POST",
              headers: {
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ colaborador_id: colaboradorId }),
            }).then(r => r.json()).then(res => {
              if (res.queued > 0) {
                console.log(`[sync-user-access] Imported ${res.queued} access records from Entra ID`);
              }
            }).catch(e => console.warn("[sync-user-access]", e));
            toast({ title: "Importando acessos atuais do Entra ID..." });
          } catch (e) { console.warn("[sync-user-access]", e); }
        }
      }

      // 4. Queue update for edits (cargo/area change)
      if (editingId && (cargoChanged || areaChanged) && !becameInactive && !becameActive) {
        const sam = form.sam_account_name.trim();
        const changedFieldsList: string[] = [];
        const newValues: Record<string, string> = {};
        if (cargoChanged) { changedFieldsList.push("title"); newValues.title = getNameById(cargos, form.cargo_id); }
        if (areaChanged) { changedFieldsList.push("department"); newValues.department = getNameById(areas, form.area_id); }

        await supabase.from("iam_queue" as any).insert({
          action_type: "update",
          payload_json: {
            samAccountName: sam,
            mail: form.email.trim() || null,
            displayName: form.nome.trim(),
            status: "enabled",
            changed_fields: changedFieldsList,
            new_values: newValues,
          },
          requested_by: profile?.email || "sistema",
          colaborador_id: colaboradorId,
          target_identity: sam || null,
        });
        // Also update Entra ID simultaneously
        const entraIdentityUpdate = form.email.trim() || sam;
        if (entraIdentityUpdate) {
          await supabase.from("iam_queue" as any).insert({
            action_type: "update_entra",
            payload_json: {
              mail: form.email.trim() || null,
              samAccountName: sam,
              displayName: form.nome.trim(),
              department: newValues.department || null,
              jobTitle: newValues.title || null,
              companyName: getNameById(empresas, form.empresa_id) || null,
            },
            requested_by: profile?.email || "sistema",
            colaborador_id: colaboradorId,
            target_identity: entraIdentityUpdate,
          });
        }
        toast({ title: "Solicitação de atualização enviada para processamento" });
      }

      // 5. Generate JML events
      if (!editingId) {
        await createEventoJML({
          colaboradorId,
          colaboradorNome: form.nome.trim(),
          tipo: "joiner",
          dadosDepois: { cargo_id: form.cargo_id, area_id: form.area_id, status: form.status },
        });
      } else if (becameInactive) {
        await createEventoJML({
          colaboradorId,
          colaboradorNome: form.nome.trim(),
          tipo: "leaver",
          dadosAntes: { status: editingStatus },
          dadosDepois: { status: form.status },
        });
      } else if (becameActive) {
        await createEventoJML({
          colaboradorId,
          colaboradorNome: form.nome.trim(),
          tipo: "joiner",
          dadosAntes: { status: editingStatus },
          dadosDepois: { status: form.status },
        });
      } else if (cargoChanged || areaChanged) {
        await createEventoJML({
          colaboradorId,
          colaboradorNome: form.nome.trim(),
          tipo: "mover",
          dadosAntes: { cargo_id: editingCargoId, area_id: editingAreaId },
          dadosDepois: { cargo_id: form.cargo_id, area_id: form.area_id },
        });
      }
    } else if (colaboradorId) {
      // Non-manual: keep existing cargo provisioning only
      const cargoChanged = form.cargo_id !== (editingCargoId || "");
      if (cargoChanged || !editingId) {
        const result = await provisionCargoAcessos(colaboradorId, form.cargo_id || null, editingCargoId || null);
        if (result.provisioned > 0 || result.revoked > 0) {
          toast({ title: `Acessos atualizados: ${result.provisioned} concedido(s), ${result.revoked} revogado(s)` });
        }
      }
    }

    setSaving(false);
    const action = editingId ? "editar_colaborador" : "criar_colaborador";
    await logAuditoria({ acao: action, entidade: "colaboradores", entidade_id: colaboradorId || undefined, resumo: `${action === "criar_colaborador" ? "Criado" : "Editado"}: ${form.nome}`, operador: profile?.email });
    toast({ title: editingId ? "Colaborador atualizado" : "Colaborador criado" });
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
    queryClient.invalidateQueries({ queryKey: ["eventos_jml"] });
    setDialogOpen(false);

    // Auto-process Entra ID queue
    triggerEntraProcessing();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const deletingColab = mapped.find(c => c.id === deleteId);
    
    // Queue delete request
    if (deletingColab) {
      const sam = deletingColab.sam_account_name || "";
      await supabase.from("iam_queue" as any).insert({
        action_type: "delete",
        payload_json: {
          samAccountName: sam,
          mail: deletingColab.email || null,
          displayName: deletingColab.nome,
          status: "disabled",
          motivo: "Exclusão do sistema",
          data_solicitacao: new Date().toISOString(),
        },
        requested_by: profile?.email || "sistema",
        colaborador_id: deleteId,
        target_identity: sam || null,
      });
    }

    const { error } = await supabase.from("colaboradores").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "excluir_colaborador", entidade: "colaboradores", entidade_id: deleteId, resumo: `Excluído: ${deletingColab?.nome}`, operador: profile?.email });
    await logAlerta({ titulo: "Colaborador excluído", mensagem: `${deletingColab?.nome} foi removido do sistema`, severidade: "aviso", tipo: "colaborador_excluido" });
    toast({ title: "Solicitação de exclusão enviada para processamento" });
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    setDeleteId(null);
    triggerEntraProcessing();
  }
  async function handleSyncAll() {
    const eligible = (colaboradores || []).filter(
      (c: any) => (c.status === "ativo" || c.status === "ferias" || c.status === "afastado") && (c.email || c.sam_account_name)
    );
    if (eligible.length === 0) {
      toast({ title: "Nenhum colaborador elegível para sincronização" });
      return;
    }
    setSyncing(true);
    toast({ title: `Sincronizando acessos de ${eligible.length} colaboradores...` });
    let ok = 0;
    let fail = 0;
    const BATCH = 5;
    for (let i = 0; i < eligible.length; i += BATCH) {
      const batch = eligible.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((c: any) =>
          supabase.functions.invoke("sync-user-access", { body: { colaborador_id: c.id } })
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled" && !r.value.error) ok++;
        else fail++;
      }
    }
    setSyncing(false);
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    queryClient.invalidateQueries({ queryKey: ["iam_queue"] });
    toast({ title: `Sincronização concluída: ${ok} sucesso, ${fail} falhas` });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Colaboradores</h1>
          <p className="text-sm text-muted-foreground">Gestão de funcionários internos</p>
        </div>
        <div data-tour="actions" className="flex flex-wrap gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" disabled={syncing} onClick={handleSyncAll}>
                  <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sincronizar acessos do Entra ID</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="outline" onClick={() => navigate("/configuracoes/integracoes")}><Upload className="mr-1 h-4 w-4" />Importar Base</Button>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Colaborador</Button>
        </div>
      </div>

      <div data-tour="search-filter" className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar nome ou email..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos status</SelectItem>
            {statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas áreas</SelectItem>
            {areasList.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cargoFilter} onValueChange={(v) => { setCargoFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cargo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos cargos</SelectItem>
            {cargosList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card data-tour="table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="p-4"><SortableHeader label="Nome" field="nome" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
                    <th className="p-4 hidden md:table-cell"><SortableHeader label="Email" field="email" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
                    <th className="p-4 font-medium hidden lg:table-cell">CPF</th>
                    <th className="p-4"><SortableHeader label="Cargo" field="cargo" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
                    <th className="p-4 hidden lg:table-cell"><SortableHeader label="Área" field="area" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
                    <th className="p-4 font-medium hidden lg:table-cell">Origem</th>
                    <th className="p-4"><SortableHeader label="Status" field="status" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th>
                    <th className="p-4 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={(e) => {
                      const tag = (e.target as HTMLElement).closest("button, a, [role='menuitem']");
                      if (!tag) navigate(`/colaboradores/${c.id}`);
                    }}>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Link to={`/colaboradores/${c.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{c.nome}</Link>
                          {c.cargo_id && !c.sam_account_name && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Login AD ausente — provisionamento de acessos bloqueado</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <ColaboradorActivityPopover colaboradorId={c.id} colaboradorNome={c.nome} />
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground hidden md:table-cell">{c.email}</td>
                      <td className="p-4 text-muted-foreground font-mono text-xs hidden lg:table-cell">{c.cpf}</td>
                      <td className="p-4 text-muted-foreground">{c.cargo}</td>
                      <td className="p-4 text-muted-foreground hidden lg:table-cell">{c.area}</td>
                      <td className="p-4 hidden lg:table-cell">
                        <Badge variant="outline" className={
                          c.origem === "csv" ? "bg-primary/10 text-primary border-primary/30" :
                          c.origem === "entra_id" ? "bg-info/10 text-info border-info/30" :
                          "bg-muted text-muted-foreground"
                        }>{c.origem === "csv" ? "CSV" : c.origem === "entra_id" ? "Entra ID" : c.origem === "manual" ? "Manual" : c.origem}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={statusConfig[c.status]?.class || ""}>
                          {statusConfig[c.status]?.label || c.status}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/colaboradores/${c.id}`)}>
                                <Search className="mr-2 h-4 w-4" />Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => { setQuickAssignColab(c); setQuickAssignType("grupo"); setQuickAssignValue(""); }}>
                                <Shield className="mr-2 h-4 w-4" />Adicionar Grupo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setQuickAssignColab(c); setQuickAssignType("licenca"); setQuickAssignValue(""); }}>
                                <Key className="mr-2 h-4 w-4" />Adicionar Licença
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setQuickAssignColab(c); setQuickAssignType("app"); setQuickAssignValue(""); }}>
                                <Monitor className="mr-2 h-4 w-4" />Adicionar App
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(c.id)}>
                                <Trash2 className="mr-2 h-4 w-4" />Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedItems.length === 0 && (
                    <tr><td colSpan={8}><EmptyState message="Nenhum colaborador encontrado." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      {/* Dialog Novo/Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} readOnly disabled className="bg-muted cursor-not-allowed" />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div>
              <Label>Matrícula</Label>
              <Input value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
            </div>
            <div>
              <Label>Nome de login AD</Label>
              <Input value={form.sam_account_name} readOnly disabled className="bg-muted cursor-not-allowed" />
            </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empresa</Label>
              <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(empresas ?? []).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Área</Label>
              <Select value={form.area_id} onValueChange={(v) => setForm({ ...form, area_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(areas ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cargo</Label>
              <Select value={form.cargo_id} onValueChange={(v) => setForm({ ...form, cargo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(cargos ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Localidade</Label>
              <Select value={form.localidade_id} onValueChange={(v) => setForm({ ...form, localidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(localidades ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data Admissão</Label>
              <Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Excluir */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Todos os acessos e dados vinculados serão removidos. Uma solicitação de exclusão será enviada para o agente de provisionamento.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Atribuição Individual Rápida */}
      <Dialog open={!!quickAssignType} onOpenChange={(open) => { if (!open) { setQuickAssignType(null); setQuickAssignColab(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {quickAssignType === "grupo" && "Adicionar Grupo"}
              {quickAssignType === "licenca" && "Adicionar Licença"}
              {quickAssignType === "app" && "Adicionar Aplicação"}
              {quickAssignColab && ` — ${quickAssignColab.nome}`}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label>{quickAssignType === "grupo" ? "Grupo Entra" : quickAssignType === "licenca" ? "Licença Entra" : "Aplicação"}</Label>
            <Select value={quickAssignValue} onValueChange={setQuickAssignValue}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {quickAssignType === "grupo" && (entraGrupos ?? []).map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                {quickAssignType === "licenca" && (entraLicencas ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
                {quickAssignType === "app" && (aplicacoes ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setQuickAssignType(null); setQuickAssignColab(null); }}>Cancelar</Button>
            <Button disabled={!quickAssignValue} onClick={async () => {
              if (!quickAssignColab || !quickAssignValue || !quickAssignType) return;
              const colab = quickAssignColab;
              const identity = colab.email || colab.sam_account_name || "";
              if (!identity) { toast({ title: "Colaborador sem email ou login AD", variant: "destructive" }); return; }

              let actionType = "";
              let payloadJson: any = { displayName: colab.nome, mail: colab.email || "" };

              if (quickAssignType === "grupo") {
                const grp = (entraGrupos ?? []).find((g: any) => g.id === quickAssignValue);
                if (!grp) return;
                actionType = "assign_group";
                payloadJson = { ...payloadJson, groupId: grp.entra_id, groupName: grp.nome };
              } else if (quickAssignType === "licenca") {
                const lic = (entraLicencas ?? []).find((l: any) => l.id === quickAssignValue);
                if (!lic) return;
                actionType = "assign_license";
                payloadJson = { ...payloadJson, skuId: lic.sku_id, licenseName: lic.nome };
              } else {
                const app = (aplicacoes ?? []).find((a: any) => a.id === quickAssignValue);
                if (!app?.entra_id) { toast({ title: "Aplicação sem ID Entra", variant: "destructive" }); return; }
                actionType = "assign_app";
                payloadJson = { ...payloadJson, appId: app.entra_id, appName: app.nome, appRoleId: app.default_app_role_id || "00000000-0000-0000-0000-000000000000" };
              }

              const { error } = await supabase.from("iam_queue" as any).insert({
                action_type: actionType,
                payload_json: payloadJson,
                target_identity: identity,
                requested_by: "manual_individual",
                colaborador_id: colab.id,
                status: "pending",
              });

              if (error) { toast({ title: "Erro ao criar solicitação", description: error.message, variant: "destructive" }); return; }
              toast({ title: `${quickAssignType === "grupo" ? "Grupo" : quickAssignType === "licenca" ? "Licença" : "App"} adicionado(a) à fila` });
              setQuickAssignType(null);
              setQuickAssignColab(null);
              setQuickAssignValue("");
              triggerEntraProcessing();
            }}>Atribuir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OnboardingTour pageKey="colaboradores" steps={tourSteps.colaboradores} />
    </div>
  );
}
