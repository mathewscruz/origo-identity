import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, CheckCircle, AlertCircle, Cloud, Users,
  FileUp, Trash2, AlertTriangle, FileSpreadsheet, Clock, Shield, Plug, FolderOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSyncJobsCsv } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import EmptyState from "@/components/EmptyState";
import { authedFetch } from "@/lib/authedFetch";

export default function IntegracoesPage() {
  const [csvSyncing, setCsvSyncing] = useState(false);
  const [spSyncing, setSpSyncing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [groupSyncing, setGroupSyncing] = useState(false);
  const [spSiteSyncing, setSpSiteSyncing] = useState(false);
  const [cycleRunning, setCycleRunning] = useState(false);
  const { toast } = useToast();
  const { data: csvJob, refetch: refetchCsv } = useSyncJobsCsv();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Job persistente da reconciliação (tipo='reconcile_identities')
  const { data: reconcileJob, refetch: refetchReconcileJob } = useQuery({
    queryKey: ["sync_jobs_reconcile_identities"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sync_jobs").select("*")
        .eq("tipo", "reconcile_identities")
        .order("created_at", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    },
    refetchInterval: (q: any) => (q.state.data?.status === "running" ? 3000 : false),
  });

  // Job do ciclo diário
  const { data: dailyJob, refetch: refetchDaily } = useQuery({
    queryKey: ["sync_jobs_daily_cycle"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sync_jobs").select("*")
        .eq("tipo", "daily_cycle")
        .order("created_at", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    },
    refetchInterval: (q: any) => (q.state.data?.status === "running" ? 3000 : false),
  });

  const reconRunning = reconcileJob?.status === "running";
  const reconStale = reconRunning && reconcileJob?.updated_at &&
    Date.now() - new Date(reconcileJob.updated_at).getTime() > 5 * 60 * 1000;
  const dailyRunning = dailyJob?.status === "running";
  const dailyStale = dailyRunning && dailyJob?.updated_at &&
    Date.now() - new Date(dailyJob.updated_at).getTime() > 30 * 60 * 1000;

  const { data: reconcileStats, refetch: refetchReconcile } = useQuery({
    queryKey: ["reconcile-stats"],
    queryFn: async () => {
      const [
        { count: total }, { count: linked }, { count: desligados },
        { count: aReconciliar }, { count: pendJoiners }, { count: pendLeavers },
      ] = await Promise.all([
        (supabase as any).from("colaboradores").select("id", { count: "exact", head: true }),
        (supabase as any).from("colaboradores").select("id", { count: "exact", head: true }).not("entra_id", "is", null),
        (supabase as any).from("colaboradores").select("id", { count: "exact", head: true }).in("status", ["desligado", "inativo"]),
        (supabase as any).from("colaboradores").select("id", { count: "exact", head: true })
          .eq("status", "ativo").is("entra_id", null).not("email", "is", null),
        (supabase as any).from("eventos_jml").select("id", { count: "exact", head: true }).eq("tipo", "joiner").eq("status", "pendente"),
        (supabase as any).from("eventos_jml").select("id", { count: "exact", head: true }).eq("tipo", "leaver").eq("status", "pendente"),
      ]);
      return {
        total: total || 0, linked: linked || 0, desligados: desligados || 0,
        aReconciliar: aReconciliar || 0,
        pendJoiners: pendJoiners || 0, pendLeavers: pendLeavers || 0,
      };
    },
    refetchInterval: 15000,
  });

  // Refetch stats quando um job termina
  useEffect(() => {
    if (reconcileJob?.status === "done" || dailyJob?.status === "done") {
      refetchReconcile();
    }
  }, [reconcileJob?.status, dailyJob?.status, refetchReconcile]);

  const handleReconcile = useCallback(async () => {
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reconcile-identities`;
      const res = await authedFetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
      const body = await res.json();
      if (!res.ok && res.status !== 202) {
        toast({ title: "Erro na reconciliação", description: body.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        toast({
          title: body.already_running ? "Reconciliação já em andamento" : "Reconciliação iniciada",
          description: "Acompanhe o progresso no painel abaixo.",
        });
        refetchReconcileJob();
      }
    } catch (err: unknown) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
  }, [toast, refetchReconcileJob]);

  const handleDailyCycle = useCallback(async () => {
    setCycleRunning(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-daily-cycle`;
      const res = await authedFetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip_csv: false }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 202) {
        toast({ title: "Erro no ciclo diário", description: body.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        toast({
          title: body.already_running ? "Ciclo já em andamento" : "Ciclo diário iniciado",
          description: "Etapas: CSV → Reconciliar → Processar fila.",
        });
        refetchDaily();
      }
    } catch (err: unknown) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
    setCycleRunning(false);
  }, [toast, refetchDaily]);

  const { data: connectorStats } = useQuery({
    queryKey: ["connector-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("aplicacoes").select("id, nome, connector_type").neq("connector_type", "manual");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (csvJob?.status === "running" && csvJob?.updated_at) {
      const updatedAt = new Date(csvJob.updated_at).getTime();
      const now = Date.now();
      const staleMs = 10 * 60 * 1000; // 10 minutes
      setCsvSyncing(now - updatedAt < staleMs);
    } else {
      setCsvSyncing(false);
    }
  }, [csvJob?.status, csvJob?.updated_at]);

  const handleCsvUpload = useCallback(async (file: File) => {
    setCsvSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-csv-colab`;
      const formData = new FormData();
      formData.append("file", file);
      authedFetch(url, { method: "POST", body: formData })
        .then(async (res) => { if (!res.ok) { const body = await res.text(); toast({ title: "Erro na importação CSV", description: body, variant: "destructive" }); } refetchCsv(); })
        .catch((err) => { toast({ title: "Erro", description: err.message, variant: "destructive" }); setCsvSyncing(false); });
      setTimeout(() => refetchCsv(), 1500);
    } catch (err: unknown) { toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" }); setCsvSyncing(false); }
  }, [toast, refetchCsv]);

  const handleSharePointSync = useCallback(async () => {
    setSpSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-sharepoint-csv`;
      const res = await authedFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, });
      const body = await res.json();
      if (!res.ok) { toast({ title: "Erro SharePoint", description: body.error || `HTTP ${res.status}`, variant: "destructive" }); }
      else { toast({ title: "Sincronização iniciada", description: `Arquivo: ${body.file}` }); setTimeout(() => refetchCsv(), 2000); }
    } catch (err: unknown) { toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" }); }
    setSpSyncing(false);
  }, [toast, refetchCsv]);

  const handleSyncGroups = useCallback(async () => {
    setGroupSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-entra-groups`;
      const res = await authedFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: "Erro ao sincronizar grupos", description: body.error || `HTTP ${res.status}`, variant: "destructive" });
      } else {
        toast({
          title: "Grupos sincronizados",
          description: `${body.total} grupos importados (${body.cloudOnly} cloud-only, ${body.onPremises} on-premises)`,
        });
      }
    } catch (err: unknown) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
    setGroupSyncing(false);
  }, [toast]);

  const handleSyncSharepointSites = useCallback(async () => {
    setSpSiteSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-sharepoint-sites`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await authedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const body = await res.json();
      if (!res.ok) { toast({ title: "Erro ao sincronizar sites", description: body.error || `HTTP ${res.status}`, variant: "destructive" }); }
      else { toast({ title: "Sites SharePoint sincronizados", description: `${body.sites} sites importados. As pastas serão carregadas sob demanda ao selecionar um site no perfil de acesso.` }); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast({ title: "Erro na sincronização", description: msg.includes("abort") ? "Timeout: a sincronização pode ainda estar rodando em segundo plano." : msg, variant: "destructive" });
    }
    setSpSiteSyncing(false);
  }, [toast]);

  const handleCleanBase = useCallback(async () => {
    setCleaning(true);
    try {
      const { data: systemUsers } = await supabase.from("profiles").select("email");
      const protectedEmails = new Set((systemUsers || []).map((o: any) => o.email?.toLowerCase()));
      const { data: toClean } = await supabase.from("colaboradores").select("id, email");
      const safeToClean = (toClean || []).filter((c: any) => !c.email || !protectedEmails.has(c.email.toLowerCase()));
      if (safeToClean.length === 0) { toast({ title: "Nada a limpar" }); setCleaning(false); return; }
      const ids = safeToClean.map((c: any) => c.id);
      const BATCH = 200;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        await supabase.from("perfil_atribuicoes").delete().in("colaborador_id", batch);
        await supabase.from("eventos_jml").delete().in("colaborador_id", batch);
        await supabase.from("iam_queue").delete().in("colaborador_id", batch);
        await supabase.from("colab_quarentena").delete().in("colaborador_id", batch);
        await supabase.from("excecoes").delete().in("colaborador_id", batch);
        await supabase.from("revisao_itens").delete().in("colaborador_id", batch);
        const { error } = await supabase.from("colaboradores").delete().in("id", batch);
        if (error) throw error;
      }
      toast({ title: "Base limpa", description: `${ids.length} colaborador(es) excluídos permanentemente.` });
    } catch (err: unknown) { toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" }); }
    setCleaning(false);
  }, [toast]);

  const showCsvProgress = (() => {
    if (!csvJob) return false;
    if (!["running", "done", "error"].includes(csvJob.status)) return false;
    const updatedAt = csvJob.updated_at ? new Date(csvJob.updated_at).getTime() : 0;
    const twoHoursMs = 2 * 60 * 60 * 1000;
    return Date.now() - updatedAt < twoHoursMs;
  })();

  return (
    <div className="space-y-4">
      {/* Connector Summary Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Plug className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Conectores de Aplicações</CardTitle><CardDescription>Integrações com sistemas externos (GLPI, SAP, etc.) para gestão de usuários</CardDescription></div>
            <Badge className="ml-auto" variant="outline">{(connectorStats || []).length} ativo(s)</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(connectorStats || []).length === 0 ? (
            <EmptyState message="Nenhuma aplicação com conector configurado. Configure na página de detalhe de cada aplicação." />
          ) : (
            <div className="space-y-2">
              {(connectorStats || []).map((app: any) => (
                <div key={app.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2 hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/aplicacoes/${app.id}`)}>
                  <span className="font-medium">{app.nome}</span>
                  <Badge variant="outline" className="bg-success/15 text-success border-success/30">{app.connector_type === "rest_api" ? "REST API" : app.connector_type === "scim" ? "SCIM" : app.connector_type}</Badge>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/aplicacoes")}>Ver todas as aplicações</Button>
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Sincronização Manual — SharePoint</CardTitle><CardDescription>Busca o CSV mais recente na pasta RH_COLAB do SharePoint sob demanda</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Site:</strong> origoenergia.sharepoint.com/sites/dataanalytics</p>
            <p><strong>Pasta:</strong> Shared Documents / RH_COLAB</p>
            <p><strong>Prefixo:</strong> <code className="text-xs bg-muted px-1 rounded">base_colab_</code></p>
          </div>
          <Button onClick={handleSharePointSync} disabled={spSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${spSyncing ? "animate-spin" : ""}`} />{spSyncing ? "Buscando no SharePoint..." : "Buscar Dados do SharePoint"}
          </Button>
          {showCsvProgress && <CsvProgressPanel job={csvJob} />}
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Reconciliar Identidades — AD / Entra ID</CardTitle>
              <CardDescription>
                Linka colaboradores existentes ao Entra ID, resolve joiners pendentes e gera desabilitações
                para desligados que ainda não foram processados
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {reconcileStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Total</div>
                <div className="text-lg font-semibold">{reconcileStats.total}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Linkados no Entra</div>
                <div className="text-lg font-semibold text-emerald-600">{reconcileStats.linked}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">A reconciliar</div>
                <div className="text-lg font-semibold text-amber-600">{reconcileStats.aReconciliar}</div>
                <div className="text-[10px] text-muted-foreground">ativos sem entra_id</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Desligados</div>
                <div className="text-lg font-semibold text-red-600">{reconcileStats.desligados}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">JML pendentes</div>
                <div className="text-lg font-semibold">
                  {reconcileStats.pendJoiners}J / {reconcileStats.pendLeavers}L
                </div>
              </div>
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            Fluxo diário: <strong>CSV do SharePoint</strong> → <strong>Reconciliar identidades</strong> (linka Entra, resolve joiners, gera leavers/disable) → <strong>Processar fila</strong> (executa disable/enable/assign no Entra).
            O botão abaixo executa a reconciliação isoladamente; use "Rodar ciclo diário" para orquestrar as 3 etapas.
          </div>

          {reconcileJob && <ReconcileProgressPanel job={reconcileJob} />}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleReconcile} disabled={reconRunning && !reconStale}>
              <RefreshCw className={`mr-2 h-4 w-4 ${reconRunning && !reconStale ? "animate-spin" : ""}`} />
              {reconRunning && !reconStale ? "Reconciliando..." : "Rodar reconciliação"}
            </Button>
            <Button variant="secondary" onClick={handleDailyCycle} disabled={(dailyRunning && !dailyStale) || cycleRunning}>
              <RefreshCw className={`mr-2 h-4 w-4 ${(dailyRunning && !dailyStale) || cycleRunning ? "animate-spin" : ""}`} />
              {dailyRunning && !dailyStale ? "Ciclo diário em andamento..." : "Rodar ciclo diário completo"}
            </Button>
          </div>

          {dailyJob && <ReconcileProgressPanel job={dailyJob} label="Ciclo diário" />}
        </CardContent>
      </Card>



      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Sincronizar Grupos — Entra ID</CardTitle><CardDescription>Puxa todos os grupos do Entra ID (cloud e on-premises) para a base local</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Importa todos os grupos do Entra ID via Microsoft Graph API.</p>
            <p>Grupos <strong>cloud-only</strong> podem ser gerenciados diretamente pelo sistema.</p>
            <p>Grupos <strong>on-premises</strong> (sincronizados do AD) são identificados automaticamente.</p>
          </div>
          <Button onClick={handleSyncGroups} disabled={groupSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${groupSyncing ? "animate-spin" : ""}`} />{groupSyncing ? "Sincronizando grupos..." : "Sincronizar Grupos do Entra ID"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Sincronizar Sites — SharePoint</CardTitle><CardDescription>Importa sites e pastas (2 níveis) do SharePoint via Microsoft Graph para uso nos perfis de acesso</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Lista todos os sites do tenant e suas pastas até 2 níveis de profundidade.</p>
            <p>Os sites e pastas importados ficam disponíveis para vincular aos <strong>Perfis de Acesso</strong>.</p>
          </div>
          <Button onClick={handleSyncSharepointSites} disabled={spSiteSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${spSiteSyncing ? "animate-spin" : ""}`} />{spSiteSyncing ? "Sincronizando sites..." : "Sincronizar Sites do SharePoint"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Importação CSV — Upload Manual</CardTitle><CardDescription>Fallback: envie um CSV manualmente caso a rotina automática falhe</CardDescription></div>
            <Badge className="ml-auto" variant="outline">Fallback</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCsvUpload(file); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={csvSyncing}>
            <FileUp className={`mr-2 h-4 w-4 ${csvSyncing ? "animate-spin" : ""}`} />{csvSyncing ? "Importando..." : "Importar CSV"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Trash2 className="h-5 w-5 text-destructive" />
            <div><CardTitle className="text-base">Limpar Base Completa</CardTitle><CardDescription>Excluir permanentemente todos os colaboradores do sistema</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive" disabled={cleaning}><Trash2 className="mr-2 h-4 w-4" />{cleaning ? "Excluindo..." : "Limpar Base Completa"}</Button></AlertDialogTrigger>
             <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle><AlertDialogDescription>Todos os colaboradores serão excluídos permanentemente do sistema, independente da origem. Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleCleanBase}>Confirmar</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function CsvProgressPanel({ job }: { job: any }) {
  const { toast } = useToast();
  const [resetting, setResetting] = useState(false);
  const isDone = job.status === "done";
  const isError = job.status === "error";
  const isRunning = job.status === "running";
  const updatedAtMs = job.updated_at ? new Date(job.updated_at).getTime() : 0;
  const isStale = isRunning && Date.now() - updatedAtMs > 5 * 60 * 1000;

  const handleReset = async () => {
    setResetting(true);
    const { error } = await supabase
      .from("sync_jobs")
      .update({ status: "error", error: "Marcado como travado pelo usuário", message: "Marcado como travado pelo usuário" })
      .eq("id", job.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Sincronização marcada como travada", description: "Você pode disparar um novo sync." });
    setResetting(false);
  };

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex items-center gap-2">
        {isError ? <AlertCircle className="h-4 w-4 text-destructive" /> : isDone ? <CheckCircle className="h-4 w-4 text-success" /> : <RefreshCw className="h-4 w-4 animate-spin text-primary" />}
        <span className="font-medium text-sm">{job.message || "Iniciando..."}</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Colaboradores</span></div><span className="text-muted-foreground">{job.colab_percent || 0}%</span></div>
        <Progress value={job.colab_percent || 0} className="h-2" />
        {(job.colab_total ?? 0) > 0 && <div className="flex gap-2 text-xs flex-wrap">
          <Badge variant="outline" className="bg-success/15 text-success border-success/30">{job.colab_created || 0} novos</Badge>
          <Badge variant="outline">{job.colab_updated || 0} atualizados</Badge>
          {(job.colab_quarentena ?? 0) > 0 && <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">{job.colab_quarentena} removidos</Badge>}
          <span className="text-muted-foreground">{job.colab_total} total</span>
        </div>}
      </div>
      {isStale && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-2">
          <p className="text-sm font-medium text-warning-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Sincronização parece travada (sem atualização há mais de 5 min)
          </p>
          <p className="text-xs text-muted-foreground">
            Os dados já importados foram preservados. Marque como travada para poder disparar um novo sync.
          </p>
          <Button size="sm" variant="outline" onClick={handleReset} disabled={resetting}>
            {resetting ? "Marcando..." : "Marcar como travada"}
          </Button>
        </div>
      )}
      {isError && job.error && <p className="text-sm text-destructive">{job.error}</p>}
      {job.filename && <p className="text-xs text-muted-foreground">Arquivo: {job.filename}</p>}
    </div>
  );
}

function ReconcileProgressPanel({ job, label }: { job: any; label?: string }) {
  const isDone = job.status === "done";
  const isError = job.status === "error";
  const isRunning = job.status === "running";
  const updatedAtMs = job.updated_at ? new Date(job.updated_at).getTime() : 0;
  const staleWindow = job.tipo === "daily_cycle" ? 30 * 60 * 1000 : 10 * 60 * 1000;
  const isStale = isRunning && Date.now() - updatedAtMs > staleWindow;
  const pct = job.users_percent || 0;
  const relTime = updatedAtMs ? new Date(updatedAtMs).toLocaleTimeString("pt-BR") : "—";

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center gap-2">
        {isError ? <AlertCircle className="h-4 w-4 text-destructive" /> :
         isDone ? <CheckCircle className="h-4 w-4 text-success" /> :
         <RefreshCw className="h-4 w-4 animate-spin text-primary" />}
        <span className="font-medium text-sm">{label || "Reconciliação"}: {job.message || job.phase || "iniciando…"}</span>
        <span className="ml-auto text-xs text-muted-foreground">{relTime}</span>
      </div>
      <Progress value={pct} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Fase: {job.phase || "—"}</span>
        <span>{pct}%</span>
      </div>
      {isStale && (
        <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground flex items-center gap-2">
          <AlertTriangle className="h-3 w-3" />
          Sem atualização há mais de {Math.round(staleWindow / 60000)} min — rode novamente.
        </div>
      )}
      {isError && job.error && <p className="text-xs text-destructive">{job.error}</p>}
    </div>
  );
}

