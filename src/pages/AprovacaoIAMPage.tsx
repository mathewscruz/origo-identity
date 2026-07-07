import { useState, useEffect } from "react";
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
  AlertDialog as AD, AlertDialogAction as ADAction, AlertDialogCancel as ADCancel,
  AlertDialogContent as ADContent, AlertDialogDescription as ADDesc,
  AlertDialogFooter as ADFooter, AlertDialogHeader as ADHeader, AlertDialogTitle as ADTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Shield, Check, X, Search, RefreshCw, AlertTriangle, Clock, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import EmptyState from "@/components/EmptyState";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { authedFetch } from "@/lib/authedFetch";

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
  review_orphan_entra: "Revisar conta órfã (Entra)",
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

// ── Classificação de ações ─────────────────────────────────────────────
function isDestructive(action: string): boolean {
  return action.startsWith("disable") || action.startsWith("remove") || action.startsWith("delete");
}
function isAdditive(action: string): boolean {
  return action.startsWith("create") || action.startsWith("assign") || action.startsWith("enable");
}
function actionScope(action: string): "AD" | "Entra" | "App externo" | "IAM" {
  if (action.endsWith("_user_app")) return "App externo";
  if (action === "create" || action === "create_if_not_exists" || action === "update" || action === "disable" || action === "enable" || action === "delete") return "AD";
  if (action.includes("entra") || action.startsWith("assign_") || action.startsWith("remove_")) return "Entra";
  return "IAM";
}
function isCritical(item: any): boolean {
  const a = item.action_type as string;
  const p = item.payload_json || {};
  return isDestructive(a) || a === "review_orphan_entra" || p.reason === "status_divergence";
}
function rowTone(item: any): string {
  const a = item.action_type as string;
  const p = item.payload_json || {};
  if (isDestructive(a)) return "bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/10";
  if (a === "review_orphan_entra" || p.reason === "status_divergence") return "bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/10";
  return "";
}

// Mini-badges de contexto (escopo + motivo/origem)
function contextBadges(item: any): { label: string; tone: string }[] {
  const p = item.payload_json || {};
  const a = item.action_type as string;
  const req = (item.requested_by || "").toLowerCase();
  const out: { label: string; tone: string }[] = [];

  const scope = actionScope(a);
  const scopeTone =
    scope === "AD" ? "bg-slate-100 text-slate-700 border-slate-200"
    : scope === "Entra" ? "bg-indigo-100 text-indigo-800 border-indigo-200"
    : scope === "App externo" ? "bg-violet-100 text-violet-800 border-violet-200"
    : "bg-muted text-muted-foreground";
  out.push({ label: scope, tone: scopeTone });

  const reason = String(p.reason || "").toLowerCase();
  if (reason === "leaver" || req.includes("leaver")) out.push({ label: "Leaver", tone: "bg-red-100 text-red-800 border-red-200" });
  else if (reason === "pre_leaver" || reason === "pre-leaver" || req.includes("pre_leaver")) out.push({ label: "Pré-desligamento", tone: "bg-orange-100 text-orange-800 border-orange-200" });
  else if (req.includes("reconcile") || reason === "orphan_approved") out.push({ label: "Reconciliação", tone: "bg-blue-100 text-blue-800 border-blue-200" });
  else if (req.includes("jml")) out.push({ label: "JML", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" });
  else if (req.includes("manual") || req.includes("user:")) out.push({ label: "Manual", tone: "bg-muted text-muted-foreground" });
  return out;
}

// Renderiza o "por quê" da ação — para decisão sem clicar
function DivergenceCell({ item }: { item: any }) {
  const p = item.payload_json || {};
  const a = item.action_type as string;

  // 1) Divergência de status base ↔ Entra
  if (p.reason === "status_divergence") {
    const entra = p.entra_account_enabled === false ? "desabilitado" : "habilitado";
    const base = String(p.colab_status ?? "?");
    const willDo = a.startsWith("enable") ? { text: "→ Habilitar", tone: "text-emerald-700" }
      : a.startsWith("disable") ? { text: "→ Desabilitar", tone: "text-red-700" }
      : a === "sync_status_from_ad" ? { text: "→ Sincronizar status do AD", tone: "text-muted-foreground" }
      : { text: `→ ${actionLabels[a] || a}`, tone: "text-muted-foreground" };
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-200 w-fit">
          <AlertTriangle className="h-3 w-3 mr-1" /> Status divergente
        </Badge>
        <span className="text-xs">Base: <strong>{base}</strong> · Entra: <strong>{entra}</strong> <span className={willDo.tone}>{willDo.text}</span></span>
      </div>
    );
  }

  // 2) Conta órfã
  if (a === "review_orphan_entra") {
    const created = p.createdDateTime ? new Date(p.createdDateTime).toLocaleDateString("pt-BR") : null;
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-200 w-fit">Conta órfã no Entra</Badge>
        <span className="text-xs text-muted-foreground">Sem match na base{created ? ` · criada em ${created}` : ""}</span>
      </div>
    );
  }

  // 3) Grupos
  if (a === "assign_group" || a === "remove_group") {
    const sign = a === "assign_group" ? "+" : "−";
    const tone = a === "assign_group" ? "text-emerald-700" : "text-red-700";
    return <span className="text-xs"><span className={`font-semibold ${tone}`}>{sign}</span> grupo: <strong>{p.groupName || p.groupId || "—"}</strong></span>;
  }

  // 4) Licenças
  if (a === "assign_license" || a === "remove_license") {
    const sign = a === "assign_license" ? "+" : "−";
    const tone = a === "assign_license" ? "text-emerald-700" : "text-red-700";
    return <span className="text-xs"><span className={`font-semibold ${tone}`}>{sign}</span> licença: <strong>{p.licenseName || p.skuPartNumber || "—"}</strong></span>;
  }

  // 5) Apps
  if (a === "assign_app" || a === "remove_app" || a.endsWith("_user_app")) {
    const verb = a === "assign_app" ? "Atribuir" : a === "remove_app" ? "Remover" : a.startsWith("create") ? "Criar em" : a.startsWith("update") ? "Atualizar em" : a.startsWith("disable") ? "Desabilitar em" : "Excluir em";
    return <span className="text-xs">{verb} <strong>{p.appName || p.appId || "app externo"}</strong></span>;
  }

  // 6) Criação
  if (a === "create" || a === "create_if_not_exists") {
    const who = p.displayName || p.mail || item.target_identity || "—";
    return <span className="text-xs">Criar <strong>{who}</strong></span>;
  }

  // 7) Update — listar campos alterados
  if (a === "update" || a === "update_entra") {
    const ignore = new Set(["userPrincipalName", "mail", "samAccountName", "id", "entra_id", "displayName"]);
    const fields = Object.keys(p).filter((k) => !ignore.has(k) && p[k] !== null && p[k] !== undefined);
    return <span className="text-xs">Alterar: <strong>{fields.slice(0, 4).join(", ") || "—"}</strong>{fields.length > 4 ? ` +${fields.length - 4}` : ""}</span>;
  }

  // 8) Disable — mostrar motivo
  if (a === "disable" || a === "disable_entra") {
    const reason = p.reason ? String(p.reason).replace(/_/g, " ") : null;
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-200 w-fit">
          <AlertTriangle className="h-3 w-3 mr-1" /> Desabilitar
        </Badge>
        {reason && <span className="text-xs text-muted-foreground">Motivo: {reason}</span>}
      </div>
    );
  }

  return <span className="text-xs text-muted-foreground">{summarizePayload(p)}</span>;
}

const PAGE_SIZE = 50;

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
  
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [onlyCritical, setOnlyCritical] = useState(false);

  // Reset page when filters/tab change
  useEffect(() => { setPage(0); setSelected(new Set()); }, [tab, actionFilter, originFilter]);

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
    onSuccess: () => { refetchMode(); toast.success("Modo atualizado"); },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });


  // ─── Count of create_if_not_exists in waiting_approval (for reconcile banner) ───
  const { data: createIfNotExistsCount = 0, refetch: refetchCreateCount } = useQuery({
    queryKey: ["iam-create-if-not-exists-count"],
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("iam_queue").select("id", { count: "exact", head: true })
        .eq("action_type", "create_if_not_exists")
        .in("status", ["waiting_approval", "pending"]);
      return count || 0;
    },
    refetchInterval: 30000,
  });

  // Debounce a busca para não bater no banco a cada tecla
  const [buscaDebounced, setBuscaDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => { setPage(0); }, [buscaDebounced]);

  // ─── Paginated queue ───
  const queryKey = ["iam-approval-queue", tab, page, actionFilter, originFilter, buscaDebounced];
  const { data: pageData, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      let q: any = (supabase as any)
        .from("iam_queue")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (tab === "waiting") q = q.eq("status", "waiting_approval");
      else q = q.in("status", ["rejected", "success", "failed", "cancelled"]);
      if (actionFilter !== "todos") q = q.eq("action_type", actionFilter);
      if (originFilter !== "todos") q = q.eq("requested_by", originFilter);
      if (buscaDebounced) {
        const safe = buscaDebounced.replace(/[%,()]/g, " ");
        q = q.or(`target_identity.ilike.%${safe}%,payload_json->>displayName.ilike.%${safe}%,payload_json->>mail.ilike.%${safe}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { items: (data || []) as IamQueueItem[], total: count || 0 };
    },
    // Realtime cobre atualizações; sem polling aqui.
    placeholderData: (prev) => prev,
  });

  const items = pageData?.items || [];
  const total = pageData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ─── Available filter options via RPC (sem truncar em 2000) ───
  const { data: filterOptions } = useQuery({
    queryKey: ["iam-filter-options", tab],
    queryFn: async () => {
      const statusFilter = tab === "waiting"
        ? ["waiting_approval"]
        : ["rejected", "success", "failed", "cancelled"];
      const { data, error } = await (supabase as any).rpc("iam_queue_distinct_actions_origins", {
        status_filter: statusFilter,
      });
      if (error) throw error;
      const actions = Array.from(new Set((data || []).map((d: any) => d.action_type).filter(Boolean))).sort();
      const origins = Array.from(new Set((data || []).map((d: any) => d.requested_by).filter(Boolean))).sort();
      return { actions, origins };
    },
    refetchInterval: 60000,
  });

  // Sem filtro client-side extra — a busca já é server-side.
  const filtered = onlyCritical ? items.filter(isCritical) : items;

  // Realtime — invalidate current page on any change
  useEffect(() => {
    const ch = supabase
      .channel("iam_queue_approval")
      .on("postgres_changes", { event: "*", schema: "public", table: "iam_queue" }, () => {
        qc.invalidateQueries({ queryKey: ["iam-approval-queue"] });
        qc.invalidateQueries({ queryKey: ["iam-legacy-pending-count"] });
        qc.invalidateQueries({ queryKey: ["iam-create-if-not-exists-count"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // ─── Mutations ───
  const approveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;

      // Buscar itens para saber se algum é revisão de órfão (fluxo especial)
      const { data: rows } = await (supabase as any)
        .from("iam_queue").select("id, action_type, payload_json, target_identity").in("id", ids);

      const orphans = (rows || []).filter((r: any) => r.action_type === "review_orphan_entra");
      const regularIds = ids.filter((id) => !orphans.find((o: any) => o.id === id));

      // 1) Itens regulares: promove para "pending" (worker executa)
      if (regularIds.length > 0) {
        const { error } = await (supabase as any)
          .from("iam_queue")
          .update({ status: "pending", approved_by: uid, approved_at: new Date().toISOString(), rejection_reason: null })
          .in("id", regularIds);
        if (error) throw error;
      }

      // 2) Órfãos aprovados: marca revisão como success e enfileira disable_entra para a conta
      if (orphans.length > 0) {
        const nowIso = new Date().toISOString();
        const { error: markErr } = await (supabase as any)
          .from("iam_queue")
          .update({
            status: "success",
            approved_by: uid,
            approved_at: nowIso,
            processed_at: nowIso,
            processed_by: "orphan-approval",
            result_message: "Revisão aprovada — conta enfileirada para desabilitação no Entra.",
          })
          .in("id", orphans.map((o: any) => o.id));
        if (markErr) throw markErr;

        const disableRows = orphans.map((o: any) => ({
          action_type: "disable_entra",
          status: "pending",
          target_identity: o.target_identity || o.payload_json?.userPrincipalName || o.payload_json?.mail,
          requested_by: "orphan-approval",
          payload_json: {
            reason: "orphan_approved",
            entra_id: o.payload_json?.entra_id,
            mail: o.payload_json?.mail || o.payload_json?.userPrincipalName,
            samAccountName: null,
            displayName: o.payload_json?.displayName,
          },
        }));
        const { error: insErr } = await (supabase as any).from("iam_queue").insert(disableRows);
        if (insErr) throw insErr;
      }

      await (supabase as any).from("auditoria").insert({
        entidade: "iam_queue", acao: "aprovar",
        resumo: `${ids.length} ação(ões) IAM aprovada(s)${orphans.length ? ` (${orphans.length} órfão(s))` : ""}`,
        detalhes: { ids, orphan_ids: orphans.map((o: any) => o.id) },
      });
      // Fire-and-forget: kicks the worker immediately, don't await
      triggerEntraProcessing(true).catch(() => {});
      return ids;
    },
    onMutate: async (ids) => {
      // Optimistic: remove IDs from current page cache
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      if (prev) {
        qc.setQueryData(queryKey, {
          ...prev,
          items: prev.items.filter((i: IamQueueItem) => !ids.includes(i.id)),
          total: Math.max(0, prev.total - ids.length),
        });
      }
      setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n; });
      return { prev };
    },
    onSuccess: (ids) => {
      toast.success(`${ids.length} item(ns) aprovado(s) — executando…`);
      qc.invalidateQueries({ queryKey: ["iam-approval-queue"] });
    },
    onError: (e: any, _ids, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(`Erro ao aprovar: ${e.message}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;

      // Descobre órfãos para registrá-los como contas conhecidas (não voltam à revisão)
      const { data: rows } = await (supabase as any)
        .from("iam_queue").select("id, action_type, payload_json").in("id", ids);
      const orphans = (rows || []).filter((r: any) => r.action_type === "review_orphan_entra");

      const { error } = await (supabase as any)
        .from("iam_queue")
        .update({ status: "rejected", approved_by: uid, approved_at: new Date().toISOString(), rejection_reason: reason })
        .in("id", ids);
      if (error) throw error;

      if (orphans.length > 0) {
        const inserts = orphans
          .filter((o: any) => o.payload_json?.entra_id)
          .map((o: any) => ({
            entra_id: o.payload_json.entra_id,
            display_name: o.payload_json.displayName || null,
            email: o.payload_json.mail || o.payload_json.userPrincipalName || null,
            motivo: reason || "Conta legítima (marcada na revisão)",
            created_by: uid || null,
          }));
        if (inserts.length > 0) {
          await (supabase as any)
            .from("contas_admin_conhecidas")
            .upsert(inserts, { onConflict: "entra_id" });
        }
      }

      await (supabase as any).from("auditoria").insert({
        entidade: "iam_queue", acao: "recusar",
        resumo: `${ids.length} ação(ões) IAM recusada(s)${orphans.length ? ` (${orphans.length} órfão(s) marcado(s) como legítimos)` : ""}`,
        detalhes: { ids, reason, orphan_ids: orphans.map((o: any) => o.id) },
      });
      return ids;
    },
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      if (prev) {
        qc.setQueryData(queryKey, {
          ...prev,
          items: prev.items.filter((i: IamQueueItem) => !ids.includes(i.id)),
          total: Math.max(0, prev.total - ids.length),
        });
      }
      return { prev };
    },
    onSuccess: (ids) => {
      toast.success(`${ids.length} item(ns) recusado(s)`);
      setSelected(new Set());
      setRejectOpen(false);
      setRejectReason("");
      setRejectTargetIds([]);
      qc.invalidateQueries({ queryKey: ["iam-approval-queue"] });
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(`Erro ao recusar: ${e.message}`);
    },
  });


  // ─── Reconcile job: fetch latest reconcile_entra sync_job and poll while running ───
  const STALE_MS = 3 * 60 * 1000;
  const isJobStale = (job: any) =>
    !!job && job.status === "running" &&
    Date.now() - new Date(job.updated_at).getTime() > STALE_MS;

  const { data: reconcileJob, refetch: refetchReconcileJob } = useQuery({
    queryKey: ["reconcile-entra-job"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sync_jobs")
        .select("id, status, phase, message, users_total, users_created, users_updated, users_percent, error, updated_at, created_at")
        .eq("tipo", "reconcile_entra")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
    // Poll every 3s only while actually running AND fresh; stop otherwise so a zombie job doesn't hog the UI.
    refetchInterval: (query) => {
      const j = query.state.data;
      if (!j || j.status !== "running") return false;
      return isJobStale(j) ? false : 3000;
    },
  });

  const reconcileRunning = !!reconcileJob && reconcileJob.status === "running" && !isJobStale(reconcileJob);
  const reconcileStale = !!reconcileJob && reconcileJob.status === "running" && isJobStale(reconcileJob);

  // Toast when a running job transitions to success/error
  useEffect(() => {
    if (!reconcileJob) return;
    const key = `reconcile-toast-${reconcileJob.id}-${reconcileJob.status}`;
    if (reconcileJob.status === "success" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      toast.success("Reconciliação concluída.");
      qc.invalidateQueries({ queryKey: ["iam-approval-queue"] });
      qc.invalidateQueries({ queryKey: ["iam-create-if-not-exists-count"] });
    } else if (reconcileJob.status === "error" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      toast.error(reconcileJob.error || reconcileJob.message || "Falha na reconciliação");
    }
  }, [reconcileJob?.id, reconcileJob?.status]);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-iam-queue`;
      const res = await authedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "reconcile-create" }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 202) throw new Error(body?.error || `HTTP ${res.status}`);
      return body;
    },
    onSuccess: (body: any) => {
      if (body?.already_running) {
        toast.info("Reconciliação já em andamento.");
      } else {
        toast.success("Reconciliação iniciada — acompanhe o progresso aqui.");
      }
      setReconcileOpen(false);
      refetchReconcileJob();
    },
    onError: (e: any) => toast.error(`Erro ao iniciar reconciliação: ${e.message}`),
  });

  const phaseLabels: Record<string, string> = {
    iniciando: "Iniciando…",
    baixando_entra: "Baixando Entra ID…",
    indexando: "Indexando usuários…",
    vinculando_colaboradores: "Vinculando colaboradores…",
    limpando_aprovacao: "Limpando fila de aprovação…",
    gravando_vinculos: "Gravando vínculos…",
    concluido: "Concluído",
    erro: "Erro",
    timeout: "Interrompido",
    falha: "Falhou",
  };
  const humanPhase = (p?: string | null) => (p ? phaseLabels[p] || p : "");
  const relTime = (iso?: string | null) => {
    if (!iso) return "";
    const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
  };


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

  return (
    <div className="p-6 space-y-4 max-w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Aprovação IAM
          </h1>
          <p className="text-sm text-muted-foreground">
            Aprove ou recuse cada ação IAM antes que ela vá para o AD/Entra.
          </p>
        </div>
        {tab === "waiting" && (
          <Badge variant="outline" className="text-sm">
            <Clock className="h-3 w-3 mr-1" />
            {total} aguardando
          </Badge>
        )}
      </div>


      {/* Reconcile banner — only when there's work to do or an active run */}
      {isAdmin && (createIfNotExistsCount > 0 || reconcileRunning || reconcileStale) && (
        <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Sparkles className={`h-5 w-5 text-blue-600 mt-0.5 shrink-0 ${reconcileRunning ? "animate-pulse" : ""}`} />
              <div className="text-sm">
                {reconcileRunning ? (
                  <>
                    <p className="font-medium text-blue-900 dark:text-blue-200">
                      {humanPhase(reconcileJob?.phase) || "Reconciliando…"} — {reconcileJob?.users_percent ?? 0}%
                    </p>
                    <p className="text-blue-800 dark:text-blue-300/90">
                      {reconcileJob?.message || "Processando em segundo plano."}
                      <span className="text-blue-700/70 dark:text-blue-300/70"> · atualizado há {relTime(reconcileJob?.updated_at)}</span>
                    </p>
                    <div className="mt-2 h-1.5 w-64 rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
                      <div className="h-full bg-blue-600 transition-all" style={{ width: `${reconcileJob?.users_percent ?? 0}%` }} />
                    </div>
                  </>
                ) : reconcileStale ? (
                  <>
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      Última execução parou em {reconcileJob?.users_percent ?? 0}% — sem atualização há {relTime(reconcileJob?.updated_at)}.
                    </p>
                    <p className="text-amber-800 dark:text-amber-300/90">
                      Rode a reconciliação novamente para continuar.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-blue-900 dark:text-blue-200">
                      {createIfNotExistsCount.toLocaleString("pt-BR")} criações aguardando reconciliação
                    </p>
                    <p className="text-blue-800 dark:text-blue-300/90">
                      Compara a base com o Entra ID e remove da fila quem já existe ou está desligado.
                    </p>
                  </>
                )}
              </div>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setReconcileOpen(true)}
              className="shrink-0"
              disabled={reconcileMutation.isPending || reconcileRunning}
            >
              <Sparkles className={`h-4 w-4 mr-2 ${reconcileRunning ? "animate-spin" : ""}`} />
              {reconcileRunning ? "Reconciliando…" : reconcileMutation.isPending ? "Iniciando…" : "Reconciliar contra Entra"}
            </Button>
          </CardContent>
        </Card>
      )}


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
              <Label htmlFor="mode" className="text-sm">{approvalMode ? "Ativado" : "Desativado"}</Label>
              <Switch id="mode" checked={!!approvalMode} disabled={!isAdmin || toggleMode.isPending} onCheckedChange={(v) => toggleMode.mutate(v)} />
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="waiting">Aguardando ({tab === "waiting" ? total : "—"})</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4 mt-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, email ou identidade…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8 h-9" />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as ações</SelectItem>
                  {(filterOptions?.actions || []).map((a: string) => <SelectItem key={a} value={a}>{actionLabels[a] || a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={originFilter} onValueChange={setOriginFilter}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as origens</SelectItem>
                  {(filterOptions?.origins || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                variant={onlyCritical ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyCritical((v) => !v)}
                className="h-9"
                title="Filtrar por ações destrutivas, divergências de status e contas órfãs"
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Só ações críticas
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

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
                <EmptyState message={tab === "waiting" ? "Nada aguardando aprovação." : "Sem histórico de decisões ainda."} />
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
                      <TableHead>Divergência / Motivo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Criado em</TableHead>
                      {tab === "history" && <TableHead>Status</TableHead>}
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((it) => (
                      <TableRow key={it.id} className={`cursor-pointer ${rowTone(it)}`} onClick={() => setDetailItem(it)}>
                        {tab === "waiting" && isAdmin && (
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selected.has(it.id)} onCheckedChange={() => toggleOne(it.id)} />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex flex-wrap gap-1 items-center">
                            <Badge variant="outline" className={`text-xs ${actionColor(it.action_type)}`}>
                              {actionLabels[it.action_type] || it.action_type}
                            </Badge>
                            {contextBadges(it).map((b, i) => (
                              <Badge key={i} variant="outline" className={`text-[10px] py-0 px-1.5 ${b.tone}`}>{b.label}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono">{it.target_identity || "—"}</div>
                          {(it.payload_json?.displayName || it.payload_json?.mail) && (
                            <div className="text-muted-foreground truncate max-w-[220px]">
                              {it.payload_json?.displayName}{it.payload_json?.mail ? ` · ${it.payload_json.mail}` : ""}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-sm">
                          <DivergenceCell item={it} />
                        </TableCell>
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
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-700" onClick={() => approveMutation.mutate([it.id])} disabled={approveMutation.isPending}>
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
              {/* Pagination */}
              {total > 0 && (
                <div className="flex items-center justify-between gap-4 p-3 border-t text-sm">
                  <span className="text-muted-foreground">
                    Página {page + 1} de {totalPages} — {total.toLocaleString("pt-BR")} itens
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Próxima <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
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
                {detailItem.payload_json?.reason === "status_divergence" && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
                    <div className="font-medium text-amber-900 dark:text-amber-200">Divergência de status</div>
                    <div className="mt-1 text-amber-900/90 dark:text-amber-100/90">
                      Base: <strong>{String(detailItem.payload_json.colab_status || "?")}</strong>
                      {" · "}Entra: <strong>{detailItem.payload_json.entra_account_enabled === false ? "desabilitado" : "habilitado"}</strong>
                    </div>
                    <div className="mt-1 text-amber-800/80 dark:text-amber-200/80">
                      Aprovar aplica a ação <em>{actionLabels[detailItem.action_type] || detailItem.action_type}</em> no Entra ID.
                    </div>
                  </div>
                )}
                {detailItem.action_type === "review_orphan_entra" && (
                  <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-xs dark:bg-blue-950/20">
                    <div className="font-medium text-blue-900 dark:text-blue-200">Conta órfã no Entra ID</div>
                    <div className="mt-1 text-blue-900/90 dark:text-blue-100/90">
                      Existe no Entra e não casou com nenhum colaborador da base.
                      {detailItem.payload_json?.createdDateTime && (
                        <> Criada em {new Date(detailItem.payload_json.createdDateTime).toLocaleDateString("pt-BR")}.</>
                      )}
                    </div>
                    <div className="mt-1 text-blue-800/80 dark:text-blue-200/80">
                      <strong>Aprovar</strong> desabilita a conta no Entra. <strong>Recusar</strong> marca como conta legítima e não voltará à revisão.
                    </div>
                  </div>
                )}
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
      <AD open={rejectOpen} onOpenChange={setRejectOpen}>
        <ADContent>
          <ADHeader>
            <ADTitle>Recusar {rejectTargetIds.length} ação(ões)?</ADTitle>
            <ADDesc>As ações não serão executadas. Informe o motivo (obrigatório):</ADDesc>
          </ADHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ex.: colaborador em férias sem previsão..." rows={4} />
          <ADFooter>
            <ADCancel>Cancelar</ADCancel>
            <ADAction disabled={!rejectReason.trim() || rejectMutation.isPending} onClick={() => rejectMutation.mutate({ ids: rejectTargetIds, reason: rejectReason.trim() })}>
              Recusar
            </ADAction>
          </ADFooter>
        </ADContent>
      </AD>


      {/* Reconcile dialog */}
      <AD open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <ADContent>
          <ADHeader>
            <ADTitle>Rodar reconciliação contra Entra ID?</ADTitle>
            <ADDesc>
              Compara a base com o Entra ID: cancela criações de quem já existe lá e de colaboradores desligados.
            </ADDesc>
          </ADHeader>
          <ADFooter>
            <ADCancel>Cancelar</ADCancel>
            <ADAction onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending}>
              {reconcileMutation.isPending ? "Reconciliando..." : "Rodar reconciliação"}
            </ADAction>
          </ADFooter>
        </ADContent>
      </AD>
    </div>
  );
}
