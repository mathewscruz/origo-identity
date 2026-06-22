import { useMemo, useState } from "react";
import { useCanEdit } from "@/hooks/useRole";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, AlertTriangle, Pencil, Trash2, RefreshCw, Search, Monitor, Globe } from "lucide-react";
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

export default function LicencasPage() {
  const canEdit = useCanEdit();
  const { data: licencas, isLoading: loadingLicencas } = useLicencas();
  const { data: entraLicencas, isLoading: loadingEntra } = useEntraLicencas();
  const { data: aplicacoes } = useAplicacoes();
  const { data: extUso } = useLicencasExternasUso();
  const { data: parametros } = useParametros();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", aplicacao_id: "", total: "0", em_uso: "0", tipo: "SaaS", custo_unitario: "", renovacao: "" });
  const [tab, setTab] = useState("todas");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Licenças</h1>
          <p className="text-sm text-muted-foreground">Inventário de licenças Microsoft e externas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handleSync} disabled={syncing} title="Sincronizar licenças Microsoft">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </Button>
          {canEdit && <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova Licença Externa</Button>}
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">SKUs ({hideTrials ? "pagas" : "todas"})</p>
          <p className="text-2xl font-bold">{(hideTrials ? paidPool : allLicenses).length}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            MS {msLicenses.filter(l => !hideTrials || !l.is_trial).length} · Ext {extLicenses.length}
          </p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Seats totais</p>
          <p className="text-2xl font-bold">{seatsTotal.toLocaleString("pt-BR")}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Excluindo trials/free</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground">Seats em uso</p>
          <p className="text-2xl font-bold">{seatsEmUso.toLocaleString("pt-BR")}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {seatsTotal > 0 ? `${Math.round((seatsEmUso / seatsTotal) * 100)}% do total` : "—"}
          </p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Externas</p>
          <p className="text-2xl font-bold">{extLicenses.length}</p>
        </CardContent></Card>
        <Card className={criticos > 0 ? "border-destructive/30" : ""}>
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Críticas (≥{criticalPct}%)</p>
            <p className={`text-2xl font-bold ${criticos > 0 ? "text-destructive" : ""}`}>{criticos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Search + toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="todas">Todas ({allLicenses.filter(l => !hideTrials || !l.is_trial).length})</TabsTrigger>
            <TabsTrigger value="microsoft">Microsoft ({msLicenses.filter(l => !hideTrials || !l.is_trial).length})</TabsTrigger>
            <TabsTrigger value="externas">Externas ({extLicenses.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3 w-full sm:w-auto">
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


      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : filtered.length === 0 ? (
          <EmptyState message="Nenhuma licença encontrada" size="lg" />
        ) : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
            <th className="p-4 font-medium">Nome</th>
            <th className="p-4 font-medium hidden md:table-cell">Origem</th>
            <th className="p-4 font-medium hidden sm:table-cell">Total</th>
            <th className="p-4 font-medium hidden sm:table-cell">Em uso</th>
            <th className="p-4 font-medium min-w-[180px]">Disponibilidade</th>
            <th className="p-4 font-medium hidden lg:table-cell">Tipo</th>
            <th className="p-4 font-medium w-20">Ações</th>
          </tr></thead><tbody>
            {paginatedItems.map((l: UnifiedLicense) => {
              const pct = l.total > 0 ? Math.min(100, Math.round((l.em_uso / l.total) * 100)) : 0;
              const disp = l.total - l.em_uso;
              const excedido = l.em_uso > l.total && l.total > 0;
              const critico = !l.is_trial && l.total > 0 && pct >= criticalPct;
              const showAsCritical = excedido || critico;
              return (
                <tr key={`${l.origem}-${l.id}`} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-primary">{l.display_name}</span>
                      {excedido && <Badge className="bg-destructive text-destructive-foreground border-0">Excedido</Badge>}
                      {l.is_trial && <Badge variant="outline" className="text-muted-foreground">Trial/Free</Badge>}
                      {l.capability_status === "Warning" && <Badge variant="outline" className="border-warning/40 text-warning">Em graça</Badge>}
                    </div>
                    {l.display_name !== l.nome && (
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{l.nome}</p>
                    )}
                  </td>
                  <td className="p-4 hidden md:table-cell">
                    {l.origem === "microsoft" ? (
                      <Badge className="bg-blue-600 hover:bg-blue-700 text-white border-0"><Monitor className="h-3 w-3 mr-1" />Microsoft</Badge>
                    ) : (
                      <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />Externa</Badge>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground hidden sm:table-cell">{l.total.toLocaleString("pt-BR")}</td>
                  <td className="p-4 hidden sm:table-cell">
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help underline decoration-dotted decoration-muted-foreground/40">
                            {l.em_uso.toLocaleString("pt-BR")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {l.em_uso_source === "microsoft" && "Reportado pela Microsoft (consumedUnits)"}
                          {l.em_uso_source === "calculated" && "Calculado a partir das atribuições processadas"}
                          {l.em_uso_source === "manual" && "Valor manual — não há atribuições rastreadas"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className={`h-2 flex-1 ${showAsCritical ? "[&>div]:bg-destructive" : pct >= 75 ? "[&>div]:bg-warning" : ""}`} />
                      <span className={`text-xs font-medium whitespace-nowrap ${showAsCritical ? "text-destructive" : "text-muted-foreground"}`}>
                        {excedido ? `+${l.em_uso - l.total} acima` : `${disp} disp.`}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground text-xs hidden lg:table-cell">{l.tipo || "—"}</td>
                  <td className="p-4">
                    {l.origem === "externa" ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(l)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(l.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Auto</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir licença?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

