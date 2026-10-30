import { useMemo, useState } from "react";
import { useIsSuperAdmin } from "@/hooks/useRole";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, Pencil, Trash2, RefreshCw, Search, Monitor, Globe } from "lucide-react";
import { AutoUpdatedHint } from "@/components/AutoUpdatedHint";
import { Progress } from "@/components/ui/progress";
import { useLicencas, useAplicacoes, useEntraLicencas, useLicencasExternasUso, useParametros } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import EmptyState from "@/components/EmptyState";
import { authedFetch } from "@/lib/authedFetch";
import PageHeader from "@/components/PageHeader";
import MetricStrip from "@/components/MetricStrip";
import DetailPanel from "@/components/DetailPanel";
import ProductLogo from "@/components/ProductLogo";
import ConfirmImpactDialog from "@/components/ConfirmImpactDialog";
import { humanize } from "@/lib/labels";
import { licencaCritica } from "@/lib/dashboardFilters";

type UnifiedLicense = {
  id: string;
  nome: string;                  // technical SKU partNumber (or external name)
  display_name: string;          // friendly name when available
  total: number;
  em_uso: number;
  em_uso_source: "microsoft" | "calculated" | "manual";
  tipo: string | null;
  origem: "microsoft" | "externa";
  is_trial: boolean;
  capability_status?: string | null;
  aplicacao_nome?: string;
  custo_unitario?: number | null;
  renovacao?: string | null;
  aplicacao_id?: string | null;
  sku_id?: string;
  raw: any;
};

function metrics(l: { total: number; em_uso: number; is_trial: boolean }) {
  const realPct = l.total > 0 ? Math.round((l.em_uso / l.total) * 100) : 0;
  const excedido = l.em_uso > l.total && l.total > 0;
  // 100% = vermelho (destructive); acima de 100% = vermelho escuro (critical)
  return { realPct, pct: Math.min(100, realPct), excedido, alerta: realPct >= 100 };
}

export default function LicencasPage() {
  const canEdit = useIsSuperAdmin();
  const { data: licencas, isLoading: loadingLicencas } = useLicencas();
  const { data: entraLicencas, isLoading: loadingEntra } = useEntraLicencas();
  const { data: aplicacoes } = useAplicacoes();
  const { data: extUso } = useLicencasExternasUso();
  const { data: parametros } = useParametros();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selected, setSelected] = useState<UnifiedLicense | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", aplicacao_id: "", total: "0", em_uso: "0", tipo: "SaaS", custo_unitario: "", renovacao: "" });
  const [tab, setTab] = useState("todas");
  const [soCriticas, setSoCriticas] = useState(() => new URLSearchParams(window.location.search).get("pendencia") === "criticas");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [hideTrials, setHideTrials] = useState(true);

  const isLoading = loadingLicencas || loadingEntra;

  const criticalPct = useMemo(() => {
    const p = (parametros ?? []).find((p: any) => p.chave === "licenca_critico_pct");
    const n = p ? parseInt(p.valor, 10) : 90;
    return Number.isFinite(n) ? n : 90;
  }, [parametros]);

  const extUsoMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of extUso ?? []) m.set(r.licenca_id, r.em_uso_calc);
    return m;
  }, [extUso]);

  // Unify both lists
  const msLicenses: UnifiedLicense[] = ((entraLicencas ?? []) as any[]).map((l) => ({
    id: l.id,
    nome: l.nome,
    display_name: l.friendly_name || l.nome,
    total: l.total,
    em_uso: l.em_uso,
    em_uso_source: "microsoft" as const,
    tipo: null,
    origem: "microsoft" as const,
    is_trial: !!l.is_trial,
    capability_status: l.capability_status ?? null,
    sku_id: l.sku_id,
    raw: l,
  }));

  const extLicenses: UnifiedLicense[] = ((licencas ?? []) as any[]).map((l) => {
    const calc = extUsoMap.get(l.id);
    const hasCalc = calc !== undefined && calc > 0;
    return {
      id: l.id,
      nome: l.nome,
      display_name: l.nome,
      total: l.total,
      em_uso: hasCalc ? calc! : l.em_uso,
      em_uso_source: hasCalc ? ("calculated" as const) : ("manual" as const),
      tipo: l.tipo,
      origem: "externa" as const,
      is_trial: false,
      aplicacao_nome: l.aplicacoes?.nome,
      custo_unitario: l.custo_unitario,
      renovacao: l.renovacao,
      aplicacao_id: l.aplicacao_id,
      raw: l,
    };
  });

  const allLicenses = [...msLicenses, ...extLicenses].sort((a, b) => a.display_name.localeCompare(b.display_name));

  const filtered = allLicenses.filter((l) => {
    if (tab === "microsoft" && l.origem !== "microsoft") return false;
    if (tab === "externas" && l.origem !== "externa") return false;
    if (hideTrials && l.is_trial) return false;
    if (soCriticas && !licencaCritica(l, criticalPct)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.display_name.toLowerCase().includes(q) && !l.nome.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Counters reflect the currently visible (filtered) population
  const paidPool = allLicenses.filter((l) => !l.is_trial);
  const criticos = paidPool.filter((l) => l.total > 0 && Math.round((l.em_uso / l.total) * 100) >= criticalPct).length;
  const seatsTotal = paidPool.reduce((s, l) => s + (l.total || 0), 0);
  const seatsEmUso = paidPool.reduce((s, l) => s + (l.em_uso || 0), 0);
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);


  const handleSync = async () => {
    setSyncing(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await authedFetch(`https://${projectId}.supabase.co/functions/v1/sync-entra-licencas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na sincronização");
      toast({ title: "Licenças Microsoft sincronizadas", description: `${data.created} novas, ${data.updated} atualizadas, ${data.deleted} removidas` });
      qc.invalidateQueries({ queryKey: ["entra_licencas"] });
    } catch (err: any) {
      toast({ title: "Erro na sincronização", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const openNew = () => { setEditing(null); setForm({ nome: "", aplicacao_id: "", total: "0", em_uso: "0", tipo: "SaaS", custo_unitario: "", renovacao: "" }); setDialogOpen(true); };
  const openEdit = (l: UnifiedLicense) => {
    setEditing(l.raw);
    setForm({ nome: l.nome, aplicacao_id: l.aplicacao_id || "", total: String(l.total), em_uso: String(l.em_uso), tipo: l.tipo || "SaaS", custo_unitario: l.custo_unitario != null ? String(l.custo_unitario) : "", renovacao: l.renovacao || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { nome: form.nome.trim(), aplicacao_id: form.aplicacao_id || null, total: parseInt(form.total) || 0, em_uso: parseInt(form.em_uso) || 0, tipo: form.tipo, custo_unitario: form.custo_unitario ? parseFloat(form.custo_unitario) : null, renovacao: form.renovacao || null };
    if (editing) {
      const { error } = await supabase.from("licencas").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "editar_licenca", entidade: "licencas", entidade_id: editing.id, resumo: `Editada: ${form.nome}` });
      toast({ title: "Licença atualizada" });
    } else {
      const { data, error } = await supabase.from("licencas").insert(payload).select("id").single();
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      await logAuditoria({ acao: "criar_licenca", entidade: "licencas", entidade_id: data?.id, resumo: `Criada: ${form.nome}` });
      toast({ title: "Licença criada" });
    }
    qc.invalidateQueries({ queryKey: ["licencas"] });
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("licencas").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await logAuditoria({ acao: "excluir_licenca", entidade: "licencas", entidade_id: deleteId });
    toast({ title: "Licença excluída" });
    qc.invalidateQueries({ queryKey: ["licencas"] });
    setDeleteId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Licenças"
        description="Inventário de licenças Microsoft e externas"
        actions={<>
          <div className="flex items-center gap-2">
            <AutoUpdatedHint tasks="sync-entra-licencas" />
            {canEdit && <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova Licença Externa</Button>}
          </div>
        </>}
      />

      <MetricStrip items={[
        { label: hideTrials ? "Licenças pagas" : "Licenças", value: (hideTrials ? paidPool : allLicenses).length, tone: "primary" },
        { label: "Contratadas", value: seatsTotal },
        { label: "Em uso", value: seatsEmUso },
        { label: "Externas", value: extLicenses.length, active: tab === "externas", onClick: () => { setTab(tab === "externas" ? "todas" : "externas"); setPage(1); } },
        { label: `Críticas (≥${criticalPct}%)`, value: criticos, tone: criticos > 0 ? "danger" : "default", active: soCriticas, onClick: () => { setSoCriticas(!soCriticas); setPage(1); } },
      ]} />

      {/* Tabs + Search + toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="todas">Todas ({allLicenses.filter(l => !hideTrials || !l.is_trial).length})</TabsTrigger>
            <TabsTrigger value="microsoft">Microsoft ({msLicenses.filter(l => !hideTrials || !l.is_trial).length})</TabsTrigger>
            <TabsTrigger value="externas">Outros ({extLicenses.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {soCriticas && <Button variant="outline" size="sm" onClick={() => { setSoCriticas(false); setPage(1); }}>Filtro: críticas ×</Button>}
          <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
            <Switch checked={hideTrials} onCheckedChange={(v) => { setHideTrials(v); setPage(1); }} />
            Ocultar trials/free
          </label>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar licença..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
          </div>
        </div>
      </div>


      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1 space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <Card><CardContent><EmptyState message="Nenhuma licença encontrada" size="lg" /></CardContent></Card>
          ) : (
            <div className={`grid gap-4 md:grid-cols-2 ${selected ? "" : "2xl:grid-cols-3"}`}>
              {paginatedItems.map((l: UnifiedLicense) => {
                const m = metrics(l);
                const isSel = selected?.id === l.id && selected.origem === l.origem;
                return (
                  <button key={`${l.origem}-${l.id}`} type="button" onClick={() => setSelected(isSel ? null : l)}
                    className={`rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/40 ${isSel ? "border-primary bg-primary/5" : ""}`}>
                    <div className="flex items-start gap-4">
                      <div className="scale-150 origin-top-left pb-3 pr-3"><ProductLogo nome={l.display_name} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 font-semibold leading-snug">{l.display_name}</p>
                          {l.capability_status === "Suspended" && <Badge variant="outline" className="shrink-0 border-warning/40 bg-warning/15 text-warning">Suspensa</Badge>}
                          {l.capability_status === "Warning" && <Badge variant="outline" className="shrink-0 border-warning/40 text-warning">Em graça</Badge>}
                          {l.is_trial && <Badge variant="outline" className="shrink-0 text-muted-foreground">Trial/Free</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{l.origem === "microsoft" ? "Microsoft" : l.aplicacao_nome || "Externa"}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-baseline justify-between">
                      <p className="text-lg"><span className="font-semibold">{l.em_uso.toLocaleString("pt-BR")}</span> de {l.total.toLocaleString("pt-BR")}</p>
                      <span className={`text-sm font-medium ${m.excedido ? "text-critical" : m.alerta ? "text-destructive" : "text-muted-foreground"}`}>{m.realPct}%</span>
                    </div>
                    <Progress value={m.pct} className={`mt-2 h-2 ${m.excedido ? "[&>div]:bg-critical" : m.alerta ? "[&>div]:bg-destructive" : m.pct >= 75 ? "[&>div]:bg-warning" : ""}`} />
                    <p className="mt-2 text-xs text-muted-foreground">Licenças usadas de contratadas</p>
                  </button>
                );
              })}
            </div>
          )}
          <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} pageSizeOptions={[12, 24, 48]} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
        </div>

        {selected && (() => {
          const m = metrics(selected);
          return (
            <DetailPanel onClose={() => setSelected(null)}>
              <div className="flex items-center gap-4 pr-8">
                <div className="scale-150 origin-left pl-1 pr-4"><ProductLogo nome={selected.display_name} /></div>
                <div className="min-w-0"><p className="text-lg font-semibold leading-snug">{selected.display_name}</p><p className="text-sm text-muted-foreground">{selected.origem === "microsoft" ? "Microsoft" : "Externa"}</p></div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                {[["Contratadas", selected.total], ["Em uso", selected.em_uso], [m.excedido ? "Acima" : "Livres", Math.abs(selected.total - selected.em_uso)]].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-muted/60 p-3"><p className={`text-xl font-semibold tabular-nums ${k === "Acima" ? "text-critical" : ""}`}>{(v as number).toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">{k}</p></div>
                ))}
              </div>
              <Progress value={m.pct} className={`mt-4 h-2 ${m.excedido ? "[&>div]:bg-critical" : m.alerta ? "[&>div]:bg-destructive" : ""}`} />
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Situação</dt><dd>{selected.capability_status === "Suspended" ? "Suspensa" : selected.capability_status === "Warning" ? "Em graça" : "Ativa"}</dd></div>
                {selected.display_name !== selected.nome && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Código</dt><dd className="truncate font-mono text-xs">{selected.nome}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Uso informado por</dt><dd>{selected.em_uso_source === "microsoft" ? "Microsoft" : selected.em_uso_source === "calculated" ? "Atribuições do IAM" : "Valor manual"}</dd></div>
                {selected.tipo && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tipo</dt><dd>{humanize(selected.tipo)}</dd></div>}
                {selected.custo_unitario != null && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Custo unitário</dt><dd>{selected.custo_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd></div>}
                {selected.renovacao && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Renovação</dt><dd>{new Date(selected.renovacao + "T12:00:00").toLocaleDateString("pt-BR")}</dd></div>}
              </dl>
              {selected.origem === "externa" && canEdit && (
                <div className="mt-6 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openEdit(selected)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>
                  <Button variant="outline" className="flex-1 text-destructive" onClick={() => setDeleteId(selected.id)}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>
                </div>
              )}
              {selected.origem === "microsoft" && <p className="mt-6 text-xs text-muted-foreground">Atualizada automaticamente a partir do tenant Microsoft.</p>}
            </DetailPanel>
          );
        })()}
      </div>

      {/* Dialog Nova/Editar Licença Externa */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Editar Licença" : "Nova Licença Externa"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-2"><Label>Aplicação</Label>
              <Select value={form.aplicacao_id} onValueChange={(v) => setForm({ ...form, aplicacao_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar (opcional)" /></SelectTrigger>
                <SelectContent>{(aplicacoes as any[] ?? []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Total</Label><Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></div>
              <div className="space-y-2"><Label>Em uso</Label><Input type="number" value={form.em_uso} onChange={(e) => setForm({ ...form, em_uso: e.target.value })} /></div>
              <div className="space-y-2"><Label>Custo unit.</Label><Input type="number" step="0.01" value={form.custo_unitario} onChange={(e) => setForm({ ...form, custo_unitario: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Tipo</Label><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></div>
              <div className="space-y-2"><Label>Renovação</Label><Input type="date" value={form.renovacao} onChange={(e) => setForm({ ...form, renovacao: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmImpactDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}
        title={`Excluir ${extLicenses.find((l) => l.id === deleteId)?.display_name ?? "licença"}?`}
        description="Esta ação não pode ser desfeita."
        impacts={[{ icon: Trash2, title: "Apaga a licença do inventário", detail: "Contagem, custo e renovação deixam de aparecer." }]}
        confirmLabel="Excluir" confirmIcon={Trash2} onConfirm={() => { handleDelete(); setSelected(null); }} />
    </div>
  );
}

