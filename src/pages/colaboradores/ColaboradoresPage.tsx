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
import { useColaboradores, useEmpresas, useAreas, useCargos, useLocalidades, useEntraGrupos, useEntraLicencas, useAplicacoes, useParametro } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { handleStatusChange } from "@/lib/colaboradorLifecycle";
import { generateEntraQueueForDiff } from "@/lib/entraQueueHelper";
import PageHeader from "@/components/PageHeader";
import { COLAB_STATUS_META } from "@/lib/queueLabels";
import EmptyState from "@/components/EmptyState";
import SortableHeader, { SortDirection, useSortableData } from "@/components/SortableHeader";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { formatAreaName } from "@/lib/formatters";
import { humanize } from "@/lib/labels";

const statusConfig = Object.fromEntries(Object.entries(COLAB_STATUS_META).map(([k, v]) => [k, { label: v.label, class: v.className }]));

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
  gestor_id: string;
  motivo: string;
}

const emptyForm: ColabForm = {
  nome: "", email: "", cpf: "", matricula: "", sam_account_name: "", status: "ativo",
  empresa_id: "", area_id: "", cargo_id: "", localidade_id: "", data_admissao: "", gestor_id: "", motivo: "",
};

export default function ColaboradoresPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca, setBusca] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "todos");
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
  const { data: gestores } = useColaboradores();
  const emailDominio = useParametro("csv_email_dominio", "origoenergia.com.br");
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
    const email = `${sam}@${emailDominio}`;
    setForm(prev => ({ ...prev, email, sam_account_name: sam }));
  }, [form.nome, editingId, emailDominio]);

  // ?edit=<id> vindo da página de detalhe abre o formulário já preenchido
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || !colaboradores) return;
    const c = (colaboradores as any[]).find((x) => x.id === editId);
    if (c) {
      openEdit({
        id: c.id, nome: c.nome, email: c.email || "", cpf_raw: c.cpf || "", matricula: c.matricula || "", sam_account_name: c.sam_account_name || "",
        status: c.status, empresa_id: c.empresa_id || "", area_id: c.area_id || "", cargo_id: c.cargo_id || "", localidade_id: c.localidade_id || "",
        data_admissao: c.data_admissao || "", origem: c.origem || "manual", gestor_id: c.gestor_id || "",
      } as any);
      const next = new URLSearchParams(searchParams); next.delete("edit"); setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, colaboradores]);

  // ?new=1 (paleta de comandos) abre o formulário de novo colaborador
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    openNew();
    const next = new URLSearchParams(searchParams); next.delete("new"); setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Quick-assign individual resource state
  const [quickAssignColab, setQuickAssignColab] = useState<any>(null);
  const [quickAssignType, setQuickAssignType] = useState<"grupo" | "licenca" | "app" | null>(null);
  const [quickAssignValue, setQuickAssignValue] = useState("");
  const [savingQuick, setSavingQuick] = useState(false);

  const mapped = (colaboradores ?? []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    email: c.email || "",
    cpf: c.cpf ? `***${c.cpf.slice(-6)}` : "—",
    cpf_raw: c.cpf || "",
    cargo: c.cargos?.nome || "—",
    cargo_id: c.cargo_id || "",
    area: formatAreaName(c.areas?.nome),
    area_id: c.area_id || "",
    empresa_id: c.empresa_id || "",
    localidade_id: c.localidade_id || "",
    matricula: c.matricula || "",
    sam_account_name: c.sam_account_name || "",
    data_admissao: c.data_admissao || "",
    status: c.status,
    origem: c.origem || "manual",
    gestor_id: c.gestor_id || "",
    entra_id: c.entra_id || null,
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
      gestor_id: (c as any).gestor_id || "", motivo: "",
    });
    setDialogOpen(true);
  }

  // Criação/edição rodam no banco (RPC colaborador_salvar): conta AD, perfis do cargo,
  // atributos no diretório, mudança de status e eventos JML numa única transação.
  // O agente é quem executa; nada de senha nem de item da fila montado aqui.
  async function handleSave() {
    if (!form.nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    const statusChanged = !!editingId && form.status !== editingStatus;
    if (statusChanged && form.status === "desligado" && form.motivo.trim().length < 5) {
      toast({ title: "Informe o motivo do desligamento", variant: "destructive" }); return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("colaborador_salvar", {
      p_id: editingId,
      p_dados: {
        nome: form.nome.trim(), email: form.email.trim() || null, cpf: form.cpf.trim() || null, matricula: form.matricula.trim() || null,
        sam_account_name: form.sam_account_name.trim() || null, status: form.status, empresa_id: form.empresa_id || null, area_id: form.area_id || null,
        cargo_id: form.cargo_id || null, localidade_id: form.localidade_id || null, gestor_id: form.gestor_id || null,
        data_admissao: form.data_admissao || null, motivo: form.motivo.trim() || null,
      },
      p_operador: profile?.email || null,
    });
    setSaving(false);
    const r = (data ?? {}) as Record<string, any>;
    if (error || r.ok === false) {
      toast({ title: "Não foi possível salvar", description: error?.message || r.error, variant: "destructive" });
      return;
    }
    const parts: string[] = [];
    if (r.conta_enfileirada) parts.push("criação da conta AD enfileirada para o agente");
    if (r.acessos_cargo) parts.push(`${r.acessos_cargo} acesso(s) do cargo enfileirado(s)`);
    if (r.mover) parts.push(`mudança de cargo: ${r.mover.queued_assign ?? 0} concessão(ões), ${r.mover.queued_remove ?? 0} remoção(ões)`);
    if (r.atributos_enfileirados) parts.push("atualização de atributos no diretório enfileirada");
    if (r.status?.remocoes_enfileiradas) parts.push(`${r.status.remocoes_enfileiradas} remoção(ões) de acesso`);
    if (r.status?.restaurados) parts.push(`${r.status.restaurados} acesso(s) restaurado(s) (aguardando aprovação)`);
    toast({ title: editingId ? "Colaborador atualizado" : "Colaborador criado", description: parts.length ? parts.join(" · ") : undefined });
    setDialogOpen(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const deletingColab = mapped.find(c => c.id === deleteId);
    // Identidades nunca são apagadas (auditoria/recertificação): "excluir" é um desligamento
    // formal — desabilita AD/Entra, revoga perfis e enfileira a remoção dos acessos.
    // (Exclusão de conta/mailbox fica fora do IAM, por política.)
    const result = await handleStatusChange({
      colab: {
        id: deleteId,
        nome: deletingColab?.nome || "",
        email: deletingColab?.email || null,
        sam_account_name: deletingColab?.sam_account_name || null,
        cargo_id: deletingColab?.cargo_id || null,
        gestor_id: (deletingColab as any)?.gestor_id || null,
        origem: (deletingColab as any)?.origem || null,
      },
      oldStatus: deletingColab?.status || "ativo",
      newStatus: "desligado",
      operadorEmail: profile?.email || null,
      operadorNome: profile?.nome || null,
      motivo: "Exclusão solicitada na ferramenta",
    });
    if (!result.success) { toast({ title: "Não foi possível desligar", description: result.error, variant: "destructive" }); return; }
    toast({ title: "Colaborador desligado", description: `${deletingColab?.nome}: contas desabilitadas e ${result.remocoes_enfileiradas ?? 0} remoção(ões) de acesso enfileirada(s). O registro é mantido para auditoria.` });
    queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
    setDeleteId(null);
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
      <PageHeader
        title="Colaboradores"
        description={`${mapped.filter((c) => c.status === "ativo").length} ativos · ${mapped.length} no total · origem RH (SharePoint) ou cadastro manual`}
        actions={<div data-tour="actions" className="flex flex-wrap gap-2">
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
        </div>}
      />

      <div data-tour="search-filter" className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar nome ou email..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); const n = new URLSearchParams(searchParams); if (v === "todos") n.delete("status"); else n.set("status", v); setSearchParams(n, { replace: true }); }}>
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
                        }>{humanize(c.origem)}</Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={statusConfig[c.status]?.class || ""}>
                          {statusConfig[c.status]?.label || humanize(c.status)}
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
                              {c.status !== "desligado" && (
                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(c.id)}>
                                  <Trash2 className="mr-2 h-4 w-4" />Desligar
                                </DropdownMenuItem>
                              )}
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
              <Input type="email" value={form.email} readOnly={!editingId} disabled={!editingId} className={!editingId ? "bg-muted cursor-not-allowed" : ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
            <div className="col-span-2">
              <Label>Gestor direto</Label>
              <Select value={form.gestor_id || "__none__"} onValueChange={(v) => setForm({ ...form, gestor_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sem gestor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem gestor</SelectItem>
                  {(gestores ?? []).filter((g: any) => g.id !== editingId && g.status === "ativo").map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editingId && form.status !== editingStatus && (
              <div className="col-span-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                <Label>Motivo da mudança de status {form.status === "desligado" ? "(obrigatório)" : ""}</Label>
                <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ex.: desligamento confirmado pelo RH em 17/09" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {form.status === "desligado" || form.status === "inativo" ? "Contas serão desabilitadas e os acessos removidos pelo agente." : form.status === "ativo" ? "A reabilitação entra na fila aguardando aprovação." : "Férias/afastamento desabilitam a conta temporariamente."}
                </p>
              </div>
            )}
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
            <AlertDialogTitle>Desligar colaborador?</AlertDialogTitle>
            <AlertDialogDescription>Identidades nunca são apagadas (auditoria e recertificação). O colaborador será marcado como desligado: contas desabilitadas e acessos removidos pelo Órigo Agente. O histórico é mantido.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Desligar</AlertDialogAction>
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
            <Button disabled={!quickAssignValue || savingQuick} onClick={async () => {
              if (!quickAssignColab || !quickAssignValue || !quickAssignType) return;
              const colab = quickAssignColab;
              if (!colab.email && !colab.sam_account_name) { toast({ title: "Colaborador sem email ou login AD", variant: "destructive" }); return; }
              setSavingQuick(true);
              try {
                const diff = { addedGrupoIds: [] as string[], removedGrupoIds: [], addedLicencaIds: [] as string[], removedLicencaIds: [], addedAppIds: [] as string[], removedAppIds: [] };
                if (quickAssignType === "grupo") diff.addedGrupoIds = [quickAssignValue];
                else if (quickAssignType === "licenca") diff.addedLicencaIds = [quickAssignValue];
                else diff.addedAppIds = [quickAssignValue];
                const n = await generateEntraQueueForDiff([{ id: colab.id, nome: colab.nome, email: colab.email || null, sam_account_name: colab.sam_account_name || null }], diff, { requestedBy: "manual_individual", motivo: `individual:${profile?.email || "operador"}` });
                toast({ title: n > 0 ? "Concessão enfileirada para o agente" : "Recurso já concedido (ou item já aberto)" });
                setQuickAssignType(null); setQuickAssignColab(null); setQuickAssignValue("");
              } catch (err: any) {
                toast({ title: "Erro ao criar solicitação", description: err.message, variant: "destructive" });
              } finally { setSavingQuick(false); }
            }}>Atribuir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OnboardingTour pageKey="colaboradores" steps={tourSteps.colaboradores} />
    </div>
  );
}
