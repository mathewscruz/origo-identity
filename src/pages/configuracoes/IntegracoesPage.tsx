import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, CheckCircle, AlertCircle, Cloud, Users, AppWindow,
  FileUp, Trash2, AlertTriangle, FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSyncJobs, useSyncJobsCsv } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function IntegracoesPage() {
  const [syncing, setSyncing] = useState(false);
  const [csvSyncing, setCsvSyncing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const { toast } = useToast();
  const { data: entraJob, refetch: refetchEntra } = useSyncJobs();
  const { data: csvJob, refetch: refetchCsv } = useSyncJobsCsv();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (entraJob?.status === "running") setSyncing(true);
    else setSyncing(false);
  }, [entraJob?.status]);

  useEffect(() => {
    if (csvJob?.status === "running") setCsvSyncing(true);
    else setCsvSyncing(false);
  }, [csvJob?.status]);

  // ── Entra ID Sync ──
  const handleEntraSync = useCallback(async () => {
    setSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-entra-id`;
      fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      }).then(async (res) => {
        if (!res.ok) toast({ title: "Erro", description: `HTTP ${res.status}`, variant: "destructive" });
        if (res.body) { const r = res.body.getReader(); while (!(await r.read()).done); }
        refetchEntra();
      }).catch((err) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
        setSyncing(false);
      });
      setTimeout(() => refetchEntra(), 1000);
    } catch (err: unknown) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
      setSyncing(false);
    }
  }, [toast, refetchEntra]);

  // ── CSV Upload ──
  const handleCsvUpload = useCallback(async (file: File) => {
    setCsvSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-csv-colab`;
      const formData = new FormData();
      formData.append("file", file);
      
      fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData,
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          toast({ title: "Erro na importação CSV", description: body, variant: "destructive" });
        }
        refetchCsv();
      }).catch((err) => {
        toast({ title: "Erro", description: err.message, variant: "destructive" });
        setCsvSyncing(false);
      });
      setTimeout(() => refetchCsv(), 1500);
    } catch (err: unknown) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
      setCsvSyncing(false);
    }
  }, [toast, refetchCsv]);

  // ── Limpar Base Manual ──
  const handleCleanBase = useCallback(async () => {
    setCleaning(true);
    try {
      // Get operadores emails to protect
      const { data: operadores } = await supabase.from("operadores").select("email");
      const protectedEmails = new Set((operadores || []).map((o: any) => o.email?.toLowerCase()));

      // Get colaboradores with manual/entra_id origem
      const { data: toClean } = await supabase
        .from("colaboradores")
        .select("id, email, origem")
        .in("origem", ["manual", "entra_id"]);

      const safeToClean = (toClean || []).filter(
        (c: any) => !c.email || !protectedEmails.has(c.email.toLowerCase())
      );

      if (safeToClean.length === 0) {
        toast({ title: "Nada a limpar", description: "Não há colaboradores manuais para desativar." });
        setCleaning(false);
        return;
      }

      const ids = safeToClean.map((c: any) => c.id);
      const { error } = await supabase
        .from("colaboradores")
        .update({ status: "inativo", origem: "obsoleto" } as any)
        .in("id", ids);

      if (error) throw error;

      // Auditoria
      await supabase.from("auditoria").insert({
        entidade: "colaboradores",
        acao: "limpar_base_manual",
        resumo: `${ids.length} colaborador(es) marcados como obsoletos`,
        detalhes: { ids, count: ids.length },
      });

      await supabase.from("alertas").insert({
        tipo: "limpeza_base",
        titulo: `Base manual limpa: ${ids.length} registros`,
        mensagem: `${ids.length} colaborador(es) de origem manual/entra_id foram marcados como inativos/obsoletos.`,
        severidade: "info",
      });

      toast({ title: "Base limpa", description: `${ids.length} colaborador(es) marcados como inativos/obsoletos.` });
    } catch (err: unknown) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
    setCleaning(false);
  }, [toast]);

  const showEntraProgress = !!entraJob && (entraJob.status === "running" || entraJob.status === "done" || entraJob.status === "error");
  const showCsvProgress = !!csvJob && (csvJob.status === "running" || csvJob.status === "done" || csvJob.status === "error");

  return (
    <div className="space-y-4">
      {/* ── CSV Colaboradores (principal) ── */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Importação CSV — Colaboradores</CardTitle>
              <CardDescription>Fonte principal: CSV diário (SharePoint / upload manual)</CardDescription>
            </div>
            <Badge className="ml-auto bg-primary/10 text-primary border-primary/30" variant="outline">Principal</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Importa colaboradores a partir de arquivo CSV com prefixo <code className="text-xs bg-muted px-1 rounded">base_colab_</code>.
            Detecta automaticamente Joiners, Movers e Leavers (quarentena). Chave: matrícula (employID).
          </p>

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsvUpload(file);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={csvSyncing}>
              <FileUp className={`mr-2 h-4 w-4 ${csvSyncing ? "animate-spin" : ""}`} />
              {csvSyncing ? "Importando..." : "Importar CSV"}
            </Button>
            <Button variant="outline" disabled title="Requer configuração SharePoint (em breve)">
              <Cloud className="mr-2 h-4 w-4" />
              Buscar do SharePoint
            </Button>
          </div>

          {showCsvProgress && (
            <CsvProgressPanel job={csvJob} />
          )}
        </CardContent>
      </Card>

      {/* ── Entra ID ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Microsoft Entra ID</CardTitle>
              <CardDescription>Sincronize aplicações do Azure AD</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Importa App Registrations como aplicações. A sincronização faz upsert.
          </p>
          <Button onClick={handleEntraSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Agora"}
          </Button>

          {showEntraProgress && (
            <div className="rounded-md border p-4 space-y-4">
              <div className="flex items-center gap-2">
                {entraJob.status === "error" ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : entraJob.status === "done" ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className="font-medium text-sm">{entraJob.message || "Iniciando..."}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Usuários</span></div>
                  <span className="text-muted-foreground">{entraJob.users_percent || 0}%</span>
                </div>
                <Progress value={entraJob.users_percent || 0} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><AppWindow className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Aplicações</span></div>
                  <span className="text-muted-foreground">{entraJob.apps_percent || 0}%</span>
                </div>
                <Progress value={entraJob.apps_percent || 0} className="h-2" />
              </div>
              {entraJob.status === "error" && entraJob.error && <p className="text-sm text-destructive">{entraJob.error}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Limpar Base ── */}
      <Card className="border-destructive/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Trash2 className="h-5 w-5 text-destructive" />
            <div>
              <CardTitle className="text-base">Limpar Base Manual</CardTitle>
              <CardDescription>Marcar colaboradores importados manualmente como obsoletos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
            <p>
              Marca colaboradores de origem <strong>manual</strong> e <strong>entra_id</strong> como inativos/obsoletos.
              Operadores do sistema são protegidos. Nenhum dado é removido fisicamente.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={cleaning}>
                <Trash2 className="mr-2 h-4 w-4" />
                {cleaning ? "Limpando..." : "Limpar Base Manual"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Limpeza</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos os colaboradores de origem manual/entra_id serão marcados como <strong>inativos/obsoletos</strong>.
                  Operadores do sistema NÃO serão afetados. Esta ação é registrada em auditoria.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleCleanBase}>Confirmar Limpeza</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function CsvProgressPanel({ job }: { job: any }) {
  const isDone = job.status === "done";
  const isError = job.status === "error";

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex items-center gap-2">
        {isError ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : isDone ? (
          <CheckCircle className="h-4 w-4 text-success" />
        ) : (
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        )}
        <span className="font-medium text-sm">{job.message || "Iniciando..."}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Colaboradores</span>
          </div>
          <span className="text-muted-foreground">{job.colab_percent || 0}%</span>
        </div>
        <Progress value={job.colab_percent || 0} className="h-2" />
        {(job.colab_total ?? 0) > 0 && (
          <div className="flex gap-2 text-xs flex-wrap">
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">
              {job.colab_created || 0} novos
            </Badge>
            <Badge variant="outline">
              {job.colab_updated || 0} atualizados
            </Badge>
            {(job.colab_quarentena ?? 0) > 0 && (
              <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                {job.colab_quarentena} quarentena
              </Badge>
            )}
            <span className="text-muted-foreground">{job.colab_total} total</span>
          </div>
        )}
      </div>

      {isError && job.error && <p className="text-sm text-destructive">{job.error}</p>}
      {job.filename && <p className="text-xs text-muted-foreground">Arquivo: {job.filename}</p>}
    </div>
  );
}
