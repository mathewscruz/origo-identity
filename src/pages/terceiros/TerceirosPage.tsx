import { useColumnVisibility } from "@/components/ColumnToggle";
import { useDeferredValue } from "react";
import { IdentityAvatar, RevalidationMini } from "@/components/identity/IdentityCells";
import ConfirmImpactDialog, { useLeaverImpacts } from "@/components/ConfirmImpactDialog";
import { Power } from "lucide-react";
import { AutoUpdatedHint } from "@/components/AutoUpdatedHint";
import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Plus, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { tercFiltros, TERC_FILTRO_LABEL } from "@/lib/dashboardFilters";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTerceiros, useParametro } from "@/hooks/useOrigoData";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { UserCheck, CalendarClock, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/EmptyState";
import SortableHeader, { SortDirection, useSortableData } from "@/components/SortableHeader";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import ColaboradorPicker from "@/components/ColaboradorPicker";
import { pareceContaServico } from "@/lib/contasServico";
import { useCanEdit } from "@/hooks/useRole";
import { useQueryClient } from "@tanstack/react-query";

const criticidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-info/15 text-info border-info/30" },
  alta: { label: "Alta", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Crítica", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

function diasRestantes(dataFim: string | null): number { if (!dataFim) return 999; return Math.ceil((new Date(dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24)); }

function normalize(str: string): string {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function generateTerceiroCredentials(nome: string, empresaTerceira: string, dominio: string): { sam: string; email: string } {
  if (!nome.trim() || !empresaTerceira.trim()) return { sam: "", email: "" };
  const prepositions = new Set(["de", "da", "do", "dos", "das", "e"]);
  const parts = normalize(nome).split(/\s+/).filter(p => !prepositions.has(p) && p.length > 0);
  if (parts.length === 0) return { sam: "", email: "" };
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : first;
  const companyFirst = normalize(empresaTerceira).split(/\s+/).filter(p => p.length > 0)[0] || "";
  const sam = `${first}.${last}_${companyFirst}`;
  const email = `${sam}@${dominio}`;
  return { sam, email };
}

function fimContratoDisplay(dataFim: string | null) {
  if (!dataFim) return <span className="text-muted-foreground">—</span>;
  const dias = diasRestantes(dataFim);
  const formatted = new Date(dataFim).toLocaleDateString("pt-BR");
  if (dias < 0) return <span className="font-medium text-destructive">{formatted} (vencido)</span>;
  if (dias <= 7) return <span className="font-medium text-destructive">{formatted} ({dias}d)</span>;
  if (dias <= 30) return <span className="font-medium text-warning">{formatted} ({dias}d)</span>;
  return <span className="text-muted-foreground">{formatted}</span>;
}

export default function TerceirosPage() {
  const cols = useColumnVisibility("terceiros", [
    { key: "empresa", label: "Empresa", index: 2 }, { key: "resp", label: "Responsável", index: 3 },
    { key: "crit", label: "Criticidade", index: 4 }, { key: "fim", label: "Fim contrato", index: 5 },
    { key: "reval", label: "Revalidação", index: 6 },
  ]);
  const [busca, setBusca] = useState("");
  const buscaDeferida = useDeferredValue(busca);
  const revalCiclo = parseInt(useParametro("terceiro_revalidacao_dias", "45"), 10) || 45;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const { data: terceiros, isLoading } = useTerceiros();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const leaverImpacts = useLeaverImpacts(undefined, deleteId ?? undefined);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", email: "", empresa_terceira: "", contrato_inicio: "", contrato_fim: "", criticidade: "media", responsavel: "", responsavel_colaborador_id: "" as string | "", ativo: true, sam_account_name: "", motivo: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { profile } = useAuth();
  const dominioTerceiro = useParametro("terceiro_email_dominio", "parceiroorigoenergia.com.br");
  const revalidacaoDias = useParametro("terceiro_revalidacao_dias", "45");
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "ativo");

  // /terceiros?new=1 (paleta) abre o cadastro; ?edit=<id> (detalhe) abre a edição
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openNew();
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
      return;
    }
    const editId = searchParams.get("edit");
    if (!editId || !terceiros) return;
    const t = (terceiros as any[]).find((x) => x.id === editId);
    if (t) openEdit(t);
    searchParams.delete("edit");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, terceiros]);

  // Login/e-mail gerados só na criação (na edição a identidade já existe no diretório)
  useEffect(() => {
    if (editing) return;
    const { sam, email } = generateTerceiroCredentials(form.nome, form.empresa_terceira, dominioTerceiro);
    setForm(prev => ({ ...prev, sam_account_name: sam, email: email }));
  }, [form.nome, form.empresa_terceira, editing, dominioTerceiro]);

  const canEdit = useCanEdit();
  const qc = useQueryClient();
  const [verSugestoes, setVerSugestoes] = useState(false);
  const list = (terceiros ?? []).filter((t: any) => !t.conta_servico);
  const sugestoes = list.filter((t: any) => t.ativo && pareceContaServico(t));
  const moverParaContaServico = async (t: any) => {
    const { data, error } = await supabase.rpc("conta_servico_mover_de_terceiro", { p_terceiro_id: t.id, p_operador: profile?.email || null });
    const r = (data ?? {}) as Record<string, any>;
    if (error || r.ok === false) { toast({ title: "Não foi possível mover", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: `${t.nome} movido para Contas de serviço` });
    qc.invalidateQueries({ queryKey: ["terceiros"] }); qc.invalidateQueries({ queryKey: ["contas_servico"] });
  };
  const vencendo7d = list.filter((t: any) => { const d = diasRestantes(t.contrato_fim); return d >= 0 && d <= 7; }).length;
  const pend = searchParams.get("pendencia") || "";
  const pendFn = pend === "revalidar" ? (t: any) => tercFiltros.revalidar(t, undefined, Number(revalidacaoDias) || 45) : (tercFiltros as any)[pend];
  const setStatusF = (v: string) => { setStatusFilter(v); setPage(1); const n = new URLSearchParams(searchParams); n.set("status", v); setSearchParams(n, { replace: true }); };
  const filtered = list.filter((t: any) => (!pendFn || pendFn(t)) && (statusFilter === "todos" || t.ativo === (statusFilter === "ativo")) && (!buscaDeferida || `${t.nome} ${t.email ?? ""} ${t.empresa_terceira ?? ""}`.toLowerCase().includes(buscaDeferida.toLowerCase())));
  const sorted = useSortableData(filtered, sortField, sortDir);
  const { paginatedItems, safePage } = usePagination(sorted, page, pageSize);

  const openNew = () => { setEditing(null); setForm({ nome: "", email: "", empresa_terceira: "", contrato_inicio: "", contrato_fim: "", criticidade: "media", responsavel: "", responsavel_colaborador_id: "", ativo: true, sam_account_name: "", motivo: "" }); setDialogOpen(true); };
  const openEdit = (t: any) => { setEditing(t); setForm({ nome: t.nome, email: t.email || "", empresa_terceira: t.empresa_terceira || "", contrato_inicio: t.contrato_inicio || "", contrato_fim: t.contrato_fim || "", criticidade: t.criticidade, responsavel: t.responsavel || "", responsavel_colaborador_id: t.responsavel_colaborador_id || "", ativo: t.ativo, sam_account_name: t.sam_account_name || "", motivo: "" }); setDialogOpen(true); };

  // Criação/edição no banco (RPC terceiro_salvar): conta AD com expiração do contrato,
  // ativar/desativar via terceiro_alterar_status (revoga perfis, remove acessos, evento JML).
  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!form.empresa_terceira.trim()) { toast({ title: "Empresa obrigatória", variant: "destructive" }); return; }
    if (!editing && !form.sam_account_name.trim()) { toast({ title: "Preencha nome e empresa para gerar login e e-mail", variant: "destructive" }); return; }
    if (editing && editing.ativo && !form.ativo && form.motivo.trim().length < 5) { toast({ title: "Informe o motivo da desativação", variant: "destructive" }); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("terceiro_salvar", {
      p_id: editing?.id ?? null,
      p_dados: {
        nome: form.nome.trim(), email: form.email || null, empresa_terceira: form.empresa_terceira.trim(), contrato_inicio: form.contrato_inicio || null,
        contrato_fim: form.contrato_fim || null, criticidade: form.criticidade, responsavel: form.responsavel || null,
        responsavel_colaborador_id: form.responsavel_colaborador_id || null, ativo: form.ativo, sam_account_name: form.sam_account_name.trim() || null,
        motivo: form.motivo.trim() || null,
      },
      p_operador: profile?.email || null,
    });
    setSaving(false);
    const r = (data ?? {}) as Record<string, any>;
    if (error || r.ok === false) { toast({ title: "Não foi possível salvar", description: error?.message || r.error, variant: "destructive" }); return; }
    const parts: string[] = [];
    if (r.conta_enfileirada) parts.push("criação da conta AD enfileirada para o agente");
    if (r.status?.remocoes) parts.push(`${r.status.remocoes} remoção(ões) de acesso enfileirada(s)`);
    if (r.status?.perfisRestaurados !== undefined) parts.push(`${r.status.perfisRestaurados} perfil(is) restaurado(s) — reabilitação aguarda aprovação`);
    toast({ title: editing ? "Terceiro atualizado" : "Terceiro criado", description: parts.length ? parts.join(" · ") : undefined });
    setDialogOpen(false);
  };

  // "Excluir" = desligar (identidades nunca são apagadas) — RPC terceiro_alterar_status
  const handleDelete = async () => {
    if (!deleteId) return;
    const { data, error } = await supabase.rpc("terceiro_alterar_status", { p_terceiro_id: deleteId, p_ativo: false, p_operador: profile?.email || "sistema", p_origem: "manual", p_motivo: "Exclusão solicitada na ferramenta" });
    const r = (data ?? {}) as Record<string, any>;
    if (error || r.ok === false) { toast({ title: "Erro", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: r.noop ? "Terceiro já estava desligado" : "Terceiro desligado", description: r.noop ? undefined : `${r.perfisRevogados ?? 0} perfil(is) revogado(s) · ${r.remocoes ?? 0} remoção(ões) enfileirada(s) para o agente` });
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Terceiros"
        description={<>Prestadores com contrato: conta expira no fim do contrato; o responsável revalida periodicamente por e-mail (Manter ou Desligar) e, sem resposta no prazo, o terceiro é desativado. Contrato vencido = desligamento automático. <AutoUpdatedHint tasks="sync-entra-groups" /></>}
        actions={<div><Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Novo Terceiro</Button></div>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ativos" value={list.filter((t: any) => t.ativo).length} icon={UserCheck} tone="success" active={statusFilter === "ativo"} onClick={() => setStatusF("ativo")} />
        <StatCard label="Vencendo em 30 dias" value={list.filter((t: any) => { const d = diasRestantes(t.contrato_fim); return t.ativo && d >= 0 && d <= 30; }).length} icon={CalendarClock} tone="warning" hint={vencendo7d > 0 ? `${vencendo7d} em 7 dias` : undefined} />
        <StatCard label="Contrato vencido" value={list.filter((t: any) => t.ativo && t.contrato_fim && diasRestantes(t.contrato_fim) < 0).length} icon={AlertTriangle} tone="destructive" hint="desligados no próximo ciclo" />
        <StatCard label="Críticos" value={list.filter((t: any) => t.ativo && t.criticidade === "critica").length} icon={ShieldAlert} tone="info" />
      </div>

      {canEdit && sugestoes.length > 0 && (
        <div className="rounded-md border border-dashed p-3 text-sm">
          <button className="text-primary hover:underline" onClick={() => setVerSugestoes(!verSugestoes)}>{sugestoes.length} possíveis contas de serviço entre os terceiros {verSugestoes ? "▲" : "▼"}</button>
          {verSugestoes && <ul className="mt-2 space-y-1">{sugestoes.map((t: any) => (
            <li key={t.id} className="flex items-center justify-between gap-2"><span className="truncate">{t.nome} <span className="text-muted-foreground">{t.email}</span></span>
              <Button size="sm" variant="outline" onClick={() => moverParaContaServico(t)}>Mover para Contas de serviço</Button></li>))}</ul>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar terceiros..." className="pl-9" value={busca} onChange={(e) => { setBusca(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusF}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
        {cols.menu}
        {TERC_FILTRO_LABEL[pend] && <Button variant="outline" size="sm" onClick={() => { const n = new URLSearchParams(searchParams); n.delete("pendencia"); setSearchParams(n); setPage(1); }}>Filtro: {TERC_FILTRO_LABEL[pend]} ×</Button>}
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <div className="max-h-[70vh] overflow-auto">{cols.styleTag}<table data-cols="terceiros" className="w-full text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wider">
            <th className="px-4 py-2.5"><SortableHeader label="Nome" field="nome" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th><th className="px-4 py-2.5 hidden md:table-cell"><SortableHeader label="Empresa" field="empresa_terceira" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th><th className="px-4 py-2.5 font-medium hidden lg:table-cell">Responsável</th>
            <th className="px-4 py-2.5 font-medium hidden md:table-cell">Criticidade</th><th className="px-4 py-2.5 font-medium">Fim Contrato</th><th className="px-4 py-2.5 font-medium hidden lg:table-cell">Revalidação</th><th className="px-4 py-2.5"><SortableHeader label="Status" field="ativo" currentField={sortField} currentDirection={sortDir} onSort={(f, d) => { setSortField(f); setSortDir(d); }} /></th><th className="px-4 py-2.5 font-medium w-20">Ações</th>
          </tr></thead><tbody>
            {paginatedItems.length === 0 && <tr><td colSpan={8}><EmptyState message="Nenhum terceiro encontrado." /></td></tr>}
            {paginatedItems.map((t: any) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><IdentityAvatar nome={t.nome} /><div className="min-w-0"><Link to={`/terceiros/${t.id}`} className="font-medium text-primary hover:underline">{t.nome}</Link><p className="truncate text-xs text-muted-foreground">{t.email || "—"}</p></div></div></td>
                <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{t.empresa_terceira || "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground hidden lg:table-cell">{t.responsavel || "—"}</td>
                <td className="px-4 py-2.5 hidden md:table-cell"><Badge variant="outline" className={criticidadeConfig[t.criticidade]?.class || ""}>{criticidadeConfig[t.criticidade]?.label || t.criticidade}</Badge></td>
                <td className="px-4 py-2.5">{fimContratoDisplay(t.contrato_fim)}</td><td className="px-4 py-2.5 hidden lg:table-cell">{t.ativo ? <RevalidationMini base={t.ultima_revalidacao || t.contrato_inicio} ciclo={revalCiclo} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2.5"><Badge variant={t.ativo ? "default" : "secondary"}>{t.ativo ? "Ativo" : "Inativo"}</Badge></td>
                <td className="px-4 py-2.5"><div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                  {t.ativo && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Desligar" onClick={() => setDeleteId(t.id)}><Trash2 className="h-3 w-3" /></Button>}
                </div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </CardContent></Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? "Editar Terceiro" : "Novo Terceiro"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome completo *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="space-y-2"><Label>Empresa *</Label><Input value={form.empresa_terceira} onChange={(e) => setForm({ ...form, empresa_terceira: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Nome de login AD</Label><Input value={form.sam_account_name} readOnly={!editing} disabled={!editing} className={!editing ? "bg-muted cursor-not-allowed" : ""} onChange={(e) => setForm({ ...form, sam_account_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} readOnly={!editing} disabled={!editing} className={!editing ? "bg-muted cursor-not-allowed" : ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Início contrato</Label><Input type="date" value={form.contrato_inicio} onChange={(e) => setForm({ ...form, contrato_inicio: e.target.value })} /></div>
              <div className="space-y-2"><Label>Fim contrato</Label><Input type="date" value={form.contrato_fim} onChange={(e) => setForm({ ...form, contrato_fim: e.target.value })} /></div>
            </div>
            <Alert className="border-primary/30 bg-primary/5">
              <Info className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs text-muted-foreground">
                A conta no AD expira no fim do contrato. A cada {revalidacaoDias} dias o responsável recebe um e-mail com link para manter ou desligar cada terceiro; sem resposta no prazo configurado, o terceiro é desativado. Ao vencer o contrato, o desligamento é automático.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Criticidade</Label>
                <Select value={form.criticidade} onValueChange={(v) => setForm({ ...form, criticidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="baixa">Baixa</SelectItem><SelectItem value="media">Média</SelectItem><SelectItem value="alta">Alta</SelectItem><SelectItem value="critica">Crítica</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <ColaboradorPicker
                  value={form.responsavel_colaborador_id || null}
                  onChange={(c) => setForm({
                    ...form,
                    responsavel_colaborador_id: c?.id || "",
                    responsavel: c ? (c.email ? `${c.nome} <${c.email}>` : c.nome) : "",
                  })}
                  placeholder="Selecione o responsável..."
                />
                <p className="text-xs text-muted-foreground">Receberá o e-mail de revalidação a cada {revalidacaoDias} dias. Sem responsável com e-mail, a revalidação não acontece (alerta).</p>
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Ativo</Label></div>
            {editing && editing.ativo !== form.ativo && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1">
                <Label>Motivo {form.ativo ? "" : "(obrigatório)"}</Label>
                <Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder={form.ativo ? "Ex.: contrato renovado" : "Ex.: fim de contrato antecipado"} />
                <p className="text-xs text-muted-foreground">{form.ativo ? "Conta reabilitada e perfis restaurados — aguardando aprovação." : "Conta desabilitada, perfis revogados e acessos removidos pelo agente."}</p>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmImpactDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}
        title={`Desligar ${((terceiros ?? []) as { id: string; nome: string }[]).find((t) => t.id === deleteId)?.nome ?? "terceiro"}?`}
        description="A identidade não é apagada: o terceiro fica inativo e o histórico é mantido."
        impacts={leaverImpacts} confirmLabel="Desligar" confirmIcon={Power} onConfirm={handleDelete} />
    </div>
  );
}
