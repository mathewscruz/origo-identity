import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X, Search, Clock, ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useExcecoes, useColaboradores, usePerfisAcesso } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import TablePagination, { usePagination } from "@/components/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { getPerfilResourceIds, generateEntraQueueForDiff } from "@/lib/entraQueueHelper";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColors: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  aprovada: "bg-success/15 text-success border-success/30",
  rejeitada: "bg-destructive/15 text-destructive border-destructive/30",
  expirada: "bg-muted text-muted-foreground",
};

type TabKey = "pendentes" | "aprovadas" | "rejeitadas" | "expiradas" | "todas";
const tabFilter: Record<TabKey, (e: { status: string; _expired?: boolean }) => boolean> = {
  pendentes: (e) => e.status === "pendente",
  aprovadas: (e) => e.status === "aprovada" && !e._expired,
  rejeitadas: (e) => e.status === "rejeitada",
  expiradas: (e) => e.status === "expirada" || e._expired === true,
  todas: () => true,
};

function markExpired(list: any[]): any[] {
  const today = new Date().toISOString().slice(0, 10);
  return list.map((e) => ({
    ...e,
    _expired: e.status === "aprovada" && e.validade && e.validade < today,
  }));
}

export default function ExcecoesPage() {
  const [tab, setTab] = useState<TabKey>("pendentes");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const { data: excecoes, isLoading } = useExcecoes();
  const { data: colaboradores } = useColaboradores();
  const { data: perfisAcesso } = usePerfisAcesso();
  const { profile } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{ id: string; action: "aprovada" | "rejeitada"; colabId?: string; perfilId?: string } | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [processing, setProcessing] = useState(false);

  // Form state
  const [formColabId, setFormColabId] = useState("");
  const [formPerfilId, setFormPerfilId] = useState("");
  const [formColabSearch, setFormColabSearch] = useState("");
  const [formPerfilSearch, setFormPerfilSearch] = useState("");
  const [formJustificativa, setFormJustificativa] = useState("");
  const [formValidade, setFormValidade] = useState("");

  const qc = useQueryClient();
  const { toast } = useToast();

  const list = useMemo(() => markExpired((excecoes ?? []) as any[]), [excecoes]);

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (e: any) =>
        (e.colaborador_nome || "").toLowerCase().includes(s) ||
        (e.solicitante || "").toLowerCase().includes(s) ||
        (e.perfil_solicitado || "").toLowerCase().includes(s) ||
        (e.perfis_acesso?.nome || "").toLowerCase().includes(s)
    );
  }, [list, search]);

  const filtered = filteredBySearch.filter(tabFilter[tab]);
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);

  // Counters
  const counts = useMemo(() => ({
    pendentes: list.filter(tabFilter.pendentes).length,
    aprovadas: list.filter(tabFilter.aprovadas).length,
    rejeitadas: list.filter(tabFilter.rejeitadas).length,
    expiradas: list.filter(tabFilter.expiradas).length,
    total: list.length,
  }), [list]);

  // Filtered collaborators/profiles for combobox
  const filteredColabs = useMemo(() => {
    const arr = (colaboradores ?? []) as any[];
    if (!formColabSearch.trim()) return arr.slice(0, 50);
    const s = formColabSearch.toLowerCase();
    return arr.filter((c: any) => c.nome.toLowerCase().includes(s) || (c.email || "").toLowerCase().includes(s)).slice(0, 50);
  }, [colaboradores, formColabSearch]);

  const filteredPerfis = useMemo(() => {
    const arr = ((perfisAcesso ?? []) as any[]).filter((p: any) => p.ativo);
    if (!formPerfilSearch.trim()) return arr.slice(0, 50);
    const s = formPerfilSearch.toLowerCase();
    return arr.filter((p: any) => p.nome.toLowerCase().includes(s)).slice(0, 50);
  }, [perfisAcesso, formPerfilSearch]);

  const resetForm = () => {
    setFormColabId(""); setFormPerfilId(""); setFormColabSearch(""); setFormPerfilSearch("");
    setFormJustificativa(""); setFormValidade("");
  };

  const handleCreate = async () => {
    if (!formJustificativa.trim()) { toast({ title: "Justificativa é obrigatória", variant: "destructive" }); return; }
    const selectedColab = (colaboradores as any[])?.find((c: any) => c.id === formColabId);
    const selectedPerfil = (perfisAcesso as any[])?.find((p: any) => p.id === formPerfilId);

    const { error } = await supabase.from("excecoes").insert({
      colaborador_id: formColabId || null,
      colaborador_nome: selectedColab?.nome || null,
      perfil_id: formPerfilId || null,
      perfil_solicitado: selectedPerfil?.nome || null,
      justificativa: formJustificativa.trim(),
      solicitante: profile?.nome || profile?.email || "Sistema",
      validade: formValidade || null,
    } as any);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Exceção solicitada" });
    qc.invalidateQueries({ queryKey: ["excecoes"] });
    setDialogOpen(false);
  };

  const handleDecision = async () => {
    if (!decisionDialog) return;
    setProcessing(true);
    const { id, action, colabId, perfilId } = decisionDialog;

    try {
      // Update exception status
      const { error } = await supabase.from("excecoes").update({
        status: action,
        data_decisao: new Date().toISOString(),
        aprovador: profile?.nome || profile?.email || "Sistema",
      } as any).eq("id", id);
      if (error) throw error;

      // If approved and we have both colab and perfil, provision access
      if (action === "aprovada" && colabId && perfilId) {
        // Create perfil_atribuicoes
        await supabase.from("perfil_atribuicoes").insert({
          colaborador_id: colabId,
          perfil_id: perfilId,
          origem: "excecao",
          ativo: true,
        } as any);

        // Get colab identity
        const { data: colab } = await (supabase as any).from("colaboradores").select("id, nome, email, sam_account_name").eq("id", colabId).single();
        if (colab) {
          const resources = await getPerfilResourceIds(perfilId);
          if (resources.grupoIds.length || resources.licencaIds.length || resources.appIds.length) {
            await generateEntraQueueForDiff(
              [{ id: colab.id, nome: colab.nome, email: colab.email, sam_account_name: colab.sam_account_name }],
              {
                addedGrupoIds: resources.grupoIds,
                removedGrupoIds: [],
                addedLicencaIds: resources.licencaIds,
                removedLicencaIds: [],
                addedAppIds: resources.appIds,
                removedAppIds: [],
              },
              { triggerImmediately: false }
            );
            await triggerEntraProcessing();
          }
        }
      }

      // Audit
      await supabase.from("auditoria").insert({
        acao: action === "aprovada" ? "aprovar_excecao" : "rejeitar_excecao",
        entidade: "excecoes",
        entidade_id: id,
        operador: profile?.email || "sistema",
        resumo: `Exceção ${action}${decisionComment ? `: ${decisionComment}` : ""}`,
      } as any);

      toast({ title: action === "aprovada" ? "Exceção aprovada" : "Exceção rejeitada" });
      qc.invalidateQueries({ queryKey: ["excecoes"] });
      qc.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
      setDecisionDialog(null);
      setDecisionComment("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exceções de Acesso</h1>
          <p className="text-sm text-muted-foreground">Concessões fora da regra com justificativa e aprovação</p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}><Plus className="mr-1 h-4 w-4" />Nova Exceção</Button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-warning" />
          <div><p className="text-2xl font-bold">{counts.pendentes}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-success" />
          <div><p className="text-2xl font-bold">{counts.aprovadas}</p><p className="text-xs text-muted-foreground">Aprovadas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <ShieldX className="h-5 w-5 text-destructive" />
          <div><p className="text-2xl font-bold">{counts.rejeitadas}</p><p className="text-xs text-muted-foreground">Rejeitadas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{counts.expiradas}</p><p className="text-xs text-muted-foreground">Expiradas</p></div>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por colaborador, solicitante ou perfil..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({counts.pendentes})</TabsTrigger>
          <TabsTrigger value="aprovadas">Aprovadas ({counts.aprovadas})</TabsTrigger>
          <TabsTrigger value="rejeitadas">Rejeitadas ({counts.rejeitadas})</TabsTrigger>
          <TabsTrigger value="expiradas">Expiradas ({counts.expiradas})</TabsTrigger>
          <TabsTrigger value="todas">Todas ({counts.total})</TabsTrigger>
        </TabsList>
        {(["pendentes", "aprovadas", "rejeitadas", "expiradas", "todas"] as TabKey[]).map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card><CardContent className="p-0">
              {isLoading ? <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
                <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground">
                  <th className="p-4 font-medium">Solicitante</th><th className="p-4 font-medium">Colaborador</th>
                  <th className="p-4 font-medium">Perfil</th><th className="p-4 font-medium">Justificativa</th>
                  <th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Solicitado em</th>
                  <th className="p-4 font-medium">Validade</th>
                  {t === "pendentes" && <th className="p-4 font-medium">Ações</th>}
                </tr></thead><tbody>
                  {paginatedItems.map((ex: any) => (
                    <tr key={ex.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4 font-medium">{ex.solicitante}</td>
                      <td className="p-4 text-primary">{ex.colaborador_nome || "—"}</td>
                      <td className="p-4 text-muted-foreground">{ex.perfil_solicitado || ex.perfis_acesso?.nome || "—"}</td>
                      <td className="p-4 text-muted-foreground text-xs max-w-[200px] truncate" title={ex.justificativa}>{ex.justificativa}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={statusColors[ex._expired ? "expirada" : ex.status]}>
                          {ex._expired ? "expirada" : ex.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-muted-foreground text-xs">{new Date(ex.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="p-4 text-muted-foreground text-xs">{ex.validade ? new Date(ex.validade).toLocaleDateString("pt-BR") : "—"}</td>
                      {t === "pendentes" && (
                        <td className="p-4"><div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-success" title="Aprovar"
                            onClick={() => setDecisionDialog({ id: ex.id, action: "aprovada", colabId: ex.colaborador_id, perfilId: ex.perfil_id })}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Rejeitar"
                            onClick={() => setDecisionDialog({ id: ex.id, action: "rejeitada" })}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div></td>
                      )}
                    </tr>
                  ))}
                  {paginatedItems.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhuma exceção.</td></tr>}
                </tbody></table>
              )}
            </CardContent></Card>
            <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          </TabsContent>
        ))}
      </Tabs>

      {/* New Exception Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Exceção</DialogTitle>
            <DialogDescription>Solicite acesso fora da regra para um colaborador</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Colaborador</Label>
              <Input placeholder="Buscar colaborador..." value={formColabSearch} onChange={(e) => { setFormColabSearch(e.target.value); setFormColabId(""); }} />
              {formColabSearch && !formColabId && (
                <div className="border rounded-md max-h-32 overflow-y-auto">
                  {filteredColabs.map((c: any) => (
                    <button key={c.id} className="w-full text-left px-3 py-1.5 hover:bg-muted text-sm" onClick={() => { setFormColabId(c.id); setFormColabSearch(c.nome); }}>
                      {c.nome} <span className="text-muted-foreground">({c.email || c.matricula || "—"})</span>
                    </button>
                  ))}
                  {filteredColabs.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</p>}
                </div>
              )}
              {formColabId && <p className="text-xs text-success">✓ Selecionado</p>}
            </div>
            <div className="space-y-2">
              <Label>Perfil solicitado</Label>
              <Input placeholder="Buscar perfil..." value={formPerfilSearch} onChange={(e) => { setFormPerfilSearch(e.target.value); setFormPerfilId(""); }} />
              {formPerfilSearch && !formPerfilId && (
                <div className="border rounded-md max-h-32 overflow-y-auto">
                  {filteredPerfis.map((p: any) => (
                    <button key={p.id} className="w-full text-left px-3 py-1.5 hover:bg-muted text-sm" onClick={() => { setFormPerfilId(p.id); setFormPerfilSearch(p.nome); }}>
                      {p.nome} <Badge variant="outline" className="ml-2 text-[10px]">{p.tipo}</Badge>
                    </button>
                  ))}
                  {filteredPerfis.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</p>}
                </div>
              )}
              {formPerfilId && <p className="text-xs text-success">✓ Selecionado</p>}
            </div>
            <div className="space-y-2"><Label>Justificativa *</Label><Textarea value={formJustificativa} onChange={(e) => setFormJustificativa(e.target.value)} rows={3} placeholder="Motivo da exceção..." /></div>
            <div className="space-y-2"><Label>Validade</Label><Input type="date" value={formValidade} onChange={(e) => setFormValidade(e.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleCreate}>Solicitar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision Confirmation Dialog */}
      <Dialog open={!!decisionDialog} onOpenChange={(open) => { if (!open) { setDecisionDialog(null); setDecisionComment(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisionDialog?.action === "aprovada" ? "Aprovar Exceção" : "Rejeitar Exceção"}</DialogTitle>
            <DialogDescription>
              {decisionDialog?.action === "aprovada"
                ? "Ao aprovar, o perfil será atribuído ao colaborador e os acessos serão provisionados no Entra ID."
                : "Ao rejeitar, a exceção será marcada como rejeitada e nenhuma ação será tomada."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Comentário (opcional)</Label>
            <Textarea value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} rows={2} placeholder="Adicione um comentário sobre sua decisão..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDecisionDialog(null); setDecisionComment(""); }} disabled={processing}>Cancelar</Button>
            <Button
              variant={decisionDialog?.action === "aprovada" ? "default" : "destructive"}
              onClick={handleDecision}
              disabled={processing}
            >
              {processing ? "Processando..." : decisionDialog?.action === "aprovada" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
