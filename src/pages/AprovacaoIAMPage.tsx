import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Shield, Check, X, Search, RefreshCw, AlertTriangle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import EmptyState from "@/components/EmptyState";

interface IamQueueItem {
  id: string;
  action_type: string;
  status: string;
  payload_json: any;
  requested_by: string | null;
  target_identity: string | null;
  colaborador_id: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  result_message: string | null;
}

const actionLabels: Record<string, string> = {
  create: "Criar usuário",
  create_if_not_exists: "Criar (se não existir)",
  update: "Atualizar usuário",
  update_entra: "Atualizar Entra",
  disable: "Desabilitar (AD)",
  enable: "Habilitar (AD)",
  disable_entra: "Desabilitar Entra ID",
  enable_entra: "Habilitar Entra ID",
  assign_group: "Adicionar em grupo",
  remove_group: "Remover de grupo",
  assign_license: "Atribuir licença",
  remove_license: "Remover licença",
  assign_app: "Atribuir aplicação",
  remove_app: "Remover aplicação",
  create_user_app: "Criar em app externo",
  update_user_app: "Atualizar em app externo",
  disable_user_app: "Desabilitar em app externo",
  delete_user_app: "Excluir em app externo",
};

function actionColor(action: string): string {
  if (action.startsWith("disable") || action.startsWith("remove") || action.startsWith("delete")) return "bg-red-100 text-red-800 border-red-200";
  if (action.startsWith("enable") || action.startsWith("create") || action.startsWith("assign")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-blue-100 text-blue-800 border-blue-200";
}

function summarizePayload(p: any): string {
  if (!p || typeof p !== "object") return "—";
  if (p.displayName || p.mail) return `${p.displayName || ""}${p.mail ? ` <${p.mail}>` : ""}`.trim();
  if (p.groupName) return p.groupName;
  if (p.licenseName || p.skuPartNumber) return p.licenseName || p.skuPartNumber;
  if (p.appName) return p.appName;
  return Object.keys(p).slice(0, 3).join(", ");
}

export default function AprovacaoIAMPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";

  const [tab, setTab] = useState<"waiting" | "history">("waiting");
  const [busca, setBusca] = useState("");
  const [actionFilter, setActionFilter] = useState("todos");
  const [originFilter, setOriginFilter] = useState("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<IamQueueItem | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTargetIds, setRejectTargetIds] = useState<string[]>([]);
  const [freezeOpen, setFreezeOpen] = useState(false);

  // ─── Approval mode toggle ───
  const { data: approvalMode, refetch: refetchMode } = useQuery({
    queryKey: ["iam-approval-mode"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("parametros").select("valor").eq("chave", "iam_approval_required").maybeSingle();
      return data?.valor === "true";
    },
  });

  const toggleMode = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await (supabase as any)
        .from("parametros")
        .update({ valor: enabled ? "true" : "false" })
        .eq("chave", "iam_approval_required");
      if (error) throw error;
    },
    onSuccess: () => {
      refetchMode();
      toast.success("Modo atualizado");
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  // ─── Queue data ───
  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["iam-approval-queue", tab],
    queryFn: async () => {
      const q = (supabase as any).from("iam_queue").select("*").order("created_at", { ascending: false }).limit(1000);
      if (tab === "waiting") q.eq("status", "waiting_approval");
      else q.in("status", ["rejected", "success", "failed", "cancelled"]).not("approved_at", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as IamQueueItem[];
    },
    refetchInterval: 10000,
  });

  // Realtime auto-refresh
  useEffect(() => {
    const ch = supabase
      .channel("iam_queue_approval")
      .on("postgres_changes", { event: "*", schema: "public", table: "iam_queue" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  const filtered = useMemo(() => {
    const q = busca.toLowerCase();
    return items.filter((it) => {
      if (actionFilter !== "todos" && it.action_type !== actionFilter) return false;
      if (originFilter !== "todos" && it.requested_by !== originFilter) return false;
      if (q) {
        const hay = `${it.target_identity || ""} ${summarizePayload(it.payload_json)} ${it.action_type} ${it.requested_by || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, busca, actionFilter, originFilter]);

  const actionTypes = useMemo(() => Array.from(new Set(items.map((i) => i.action_type))).sort(), [items]);
  const origins = useMemo(() => Array.from(new Set(items.map((i) => i.requested_by).filter(Boolean) as string[])).sort(), [items]);

  const groups = useMemo(() => {
    const map = new Map<string, { origin: string; action: string; items: IamQueueItem[] }>();
    for (const it of filtered) {
      const key = `${it.requested_by || "—"}::${it.action_type}`;
      if (!map.has(key)) map.set(key, { origin: it.requested_by || "—", action: it.action_type, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filtered]);

  // ─── Mutations ───
  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      const { error } = await (supabase as any)
        .from("iam_queue")
        .update({ status: "pending", approved_by: uid, approved_at: new Date().toISOString(), rejection_reason: null })
        .in("id", ids);
      if (error) throw error;
      await (supabase as any).from("auditoria").insert({
        entidade: "iam_queue", acao: "aprovar",
        resumo: `${ids.length} ação(ões) IAM aprovada(s)`,
        detalhes: { ids },
      });
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} item(ns) aprovado(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["iam-approval-queue"] });
    },
    onError: (e: any) => toast.error(`Erro ao aprovar: ${e.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      const { error } = await (supabase as any)
        .from("iam_queue")
        .update({ status: "rejected", approved_by: uid, approved_at: new Date().toISOString(), rejection_reason: reason })
        .in("id", ids);
      if (error) throw error;
      await (supabase as any).from("auditoria").insert({
        entidade: "iam_queue", acao: "recusar",
        resumo: `${ids.length} ação(ões) IAM recusada(s)`,
        detalhes: { ids, reason },
      });
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.ids.length} item(ns) recusado(s)`);
      setSelected(new Set());
      setRejectOpen(false);
      setRejectReason("");
      setRejectTargetIds([]);
      qc.invalidateQueries({ queryKey: ["iam-approval-queue"] });
    },
    onError: (e: any) => toast.error(`Erro ao recusar: ${e.message}`),
  });

  const freezeMutation = useMutation({
    mutationFn: async () => {
      const { error, count } = await (supabase as any)
        .from("iam_queue")
        .update({ status: "waiting_approval" }, { count: "exact" })
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    onSuccess: (n) => {
      toast.success(`${n} item(ns) movido(s) para aprovação`);
      setFreezeOpen(false);
      qc.invalidateQueries({ queryKey: ["iam-approval-queue"] });
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  // ─── UI helpers ───
  function toggleOne(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  }
  function openReject(ids: string[]) {
    setRejectTargetIds(ids);
    setRejectReason("");
    setRejectOpen(true);
  }

  const waitingCount = tab === "waiting" ? filtered.length : items.length;

  return (
    <div className="p-6 space-y-4 max-w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Aprovação IAM
          </h1>
          <p className="text-sm text-muted-foreground">
            Gate de aprovação para toda ação IAM (criação, alteração, exclusão, grupos, licenças, apps).
          </p>
        </div>
        {tab === "waiting" && (
          <Badge variant="outline" className="text-sm">
            <Clock className="h-3 w-3 mr-1" />
            {waitingCount} aguardando
          </Badge>
        )}
      </div>

      {/* Toggle card */}
      <Card className={approvalMode ? "border-primary/40 bg-primary/5" : "border-muted"}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Modo Aprovação Obrigatória</CardTitle>
              <CardDescription>
                Quando ligado, nenhuma ação é enviada ao AD/Entra sem aprovação de um administrador.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="mode" className="text-sm">
                {approvalMode ? "Ativado" : "Desativado"}
              </Label>
              <Switch
                id="mode"
                checked={!!approvalMode}
                disabled={!isAdmin || toggleMode.isPending}
                onCheckedChange={(v) => toggleMode.mutate(v)}
              />
            </div>
          </div>
        </CardHeader>
        {approvalMode && isAdmin && (
          <CardContent className="pt-0">
            <Button variant="outline" size="sm" onClick={() => setFreezeOpen(true)}>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Congelar fila atual (mover pendentes para aprovação)
            </Button>
          </CardContent>
        )}
      </Card>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setSelected(new Set()); }}>
        <TabsList>
          <TabsTrigger value="waiting">Aguardando ({tab === "waiting" ? items.length : "—"})</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4 mt-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por colaborador, ação, origem..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8 h-9" />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as ações</SelectItem>
                  {actionTypes.map((a) => <SelectItem key={a} value={a}>{actionLabels[a] || a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as origens</SelectItem>
                  {origins.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Groups summary */}
          {tab === "waiting" && groups.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Resumo por origem / ação</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {groups.slice(0, 12).map((g) => (
                  <div key={`${g.origin}-${g.action}`} className="flex items-center justify-between rounded border p-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{actionLabels[g.action] || g.action}</div>
                      <div className="text-muted-foreground truncate">{g.origin}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{g.items.length}</Badge>
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-700" onClick={() => approveMutation.mutate(g.items.map((i) => i.id))} disabled={approveMutation.isPending}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-700" onClick={() => openReject(g.items.map((i) => i.id))}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Bulk action bar */}
          {tab === "waiting" && selected.size > 0 && isAdmin && (
            <div className="sticky top-2 z-10 flex items-center gap-2 rounded-lg border bg-background p-2 shadow-sm">
              <span className="text-sm font-medium ml-2">{selected.size} selecionado(s)</span>
              <div className="flex-1" />
              <Button size="sm" variant="default" onClick={() => approveMutation.mutate(Array.from(selected))} disabled={approveMutation.isPending}>
                <Check className="h-4 w-4 mr-1" /> Aprovar selecionados
              </Button>
              <Button size="sm" variant="destructive" onClick={() => openReject(Array.from(selected))}>
                <X className="h-4 w-4 mr-1" /> Recusar selecionados
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
            </div>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  message={tab === "waiting" ? "Nada aguardando aprovação. Todas as ações IAM foram processadas." : "Sem histórico de decisões ainda."}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {tab === "waiting" && isAdmin && (
                        <TableHead className="w-8">
                          <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                        </TableHead>
                      )}
                      <TableHead>Ação</TableHead>
                      <TableHead>Alvo</TableHead>
                      <TableHead>Detalhe</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Criado em</TableHead>
                      {tab === "history" && <TableHead>Status</TableHead>}
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 500).map((it) => (
                      <TableRow key={it.id} className="cursor-pointer" onClick={() => setDetailItem(it)}>
                        {tab === "waiting" && isAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleOne(it.id)} />
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${actionColor(it.action_type)}`}>
                            {actionLabels[it.action_type] || it.action_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{it.target_identity || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{summarizePayload(it.payload_json)}</TableCell>
                        <TableCell className="text-xs">{it.requested_by || "—"}</TableCell>
                        <TableCell className="text-xs">{new Date(it.created_at).toLocaleString("pt-BR")}</TableCell>
                        {tab === "history" && (
                          <TableCell>
                            {it.status === "rejected" ? (
                              <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Recusado</Badge>
                            ) : it.status === "success" ? (
                              <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Executado</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">{it.status}</Badge>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {tab === "waiting" && isAdmin && (
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-700" onClick={() => approveMutation.mutate([it.id])}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-700" onClick={() => openReject([it.id])}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {filtered.length > 500 && (
                <div className="p-2 text-xs text-muted-foreground text-center border-t">
                  Mostrando 500 de {filtered.length}. Refine os filtros para ver mais.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail drawer */}
      <Sheet open={!!detailItem} onOpenChange={(o) => !o && setDetailItem(null)}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          {detailItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={actionColor(detailItem.action_type)}>{actionLabels[detailItem.action_type] || detailItem.action_type}</Badge>
                  {detailItem.target_identity}
                </SheetTitle>
                <SheetDescription>
                  Origem: {detailItem.requested_by || "—"} • Criado em {new Date(detailItem.created_at).toLocaleString("pt-BR")}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Payload</Label>
                  <pre className="mt-1 text-xs bg-muted p-3 rounded overflow-x-auto max-h-96">
                    {JSON.stringify(detailItem.payload_json, null, 2)}
                  </pre>
                </div>
                {detailItem.result_message && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Resultado</Label>
                    <div className="mt-1 text-xs">{detailItem.result_message}</div>
                  </div>
                )}
                {detailItem.rejection_reason && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Motivo da recusa</Label>
                    <div className="mt-1 text-xs text-red-700">{detailItem.rejection_reason}</div>
                  </div>
                )}
                {detailItem.approved_at && (
                  <div className="text-xs text-muted-foreground">
                    Decidido em {new Date(detailItem.approved_at).toLocaleString("pt-BR")}
                  </div>
                )}
                {detailItem.status === "waiting_approval" && isAdmin && (
                  <div className="flex gap-2 pt-2">
                    <Button className="flex-1" onClick={() => { approveMutation.mutate([detailItem.id]); setDetailItem(null); }}>
                      <Check className="h-4 w-4 mr-1" />Aprovar
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => { openReject([detailItem.id]); setDetailItem(null); }}>
                      <X className="h-4 w-4 mr-1" />Recusar
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject dialog */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar {rejectTargetIds.length} ação(ões)?</AlertDialogTitle>
            <AlertDialogDescription>
              As ações não serão executadas no AD/Entra ID. Informe o motivo (obrigatório):
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ex.: colaborador em férias sem previsão de retorno..." rows={4} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!rejectReason.trim() || rejectMutation.isPending} onClick={() => rejectMutation.mutate({ ids: rejectTargetIds, reason: rejectReason.trim() })}>
              Recusar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Freeze dialog */}
      <AlertDialog open={freezeOpen} onOpenChange={setFreezeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Congelar fila atual?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os itens atualmente em status <strong>pendente</strong> serão movidos para <strong>aguardando aprovação</strong>.
              Use isso para revisar backlog gerado antes do gate ser ativado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => freezeMutation.mutate()} disabled={freezeMutation.isPending}>
              Congelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
