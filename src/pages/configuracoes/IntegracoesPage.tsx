import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, CheckCircle, AlertCircle, Cloud, Users,
  FileUp, Trash2, AlertTriangle, FileSpreadsheet, Clock, Shield,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSyncJobsCsv } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function IntegracoesPage() {
  const [csvSyncing, setCsvSyncing] = useState(false);
  const [spSyncing, setSpSyncing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [groupSyncing, setGroupSyncing] = useState(false);
  const { toast } = useToast();
  const { data: csvJob, refetch: refetchCsv } = useSyncJobsCsv();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCsvSyncing(csvJob?.status === "running"); }, [csvJob?.status]);

  const handleCsvUpload = useCallback(async (file: File) => {
    setCsvSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-csv-colab`;
      const formData = new FormData();
      formData.append("file", file);
      fetch(url, { method: "POST", headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` }, body: formData })
        .then(async (res) => { if (!res.ok) { const body = await res.text(); toast({ title: "Erro na importação CSV", description: body, variant: "destructive" }); } refetchCsv(); })
        .catch((err) => { toast({ title: "Erro", description: err.message, variant: "destructive" }); setCsvSyncing(false); });
      setTimeout(() => refetchCsv(), 1500);
    } catch (err: unknown) { toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" }); setCsvSyncing(false); }
  }, [toast, refetchCsv]);

  const handleSharePointSync = useCallback(async () => {
    setSpSyncing(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-sharepoint-csv`;
      const res = await fetch(url, { method: "POST", headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" } });
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
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

  const handleCleanBase = useCallback(async () => {
    setCleaning(true);
    try {
      const { data: operadores } = await supabase.from("operadores").select("email");
      const protectedEmails = new Set((operadores || []).map((o: any) => o.email?.toLowerCase()));
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

  const showCsvProgress = !!csvJob && (csvJob.status === "running" || csvJob.status === "done" || csvJob.status === "error");

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Sincronização Automática — SharePoint</CardTitle><CardDescription>Rotina diária às 12:00 UTC (09:00 BRT) busca o CSV mais recente na pasta RH_COLAB</CardDescription></div>
            <Badge className="ml-auto bg-primary/10 text-primary border-primary/30" variant="outline"><Clock className="mr-1 h-3 w-3" /> Diário</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p><strong>Site:</strong> origoenergia.sharepoint.com/sites/dataanalytics</p>
            <p><strong>Pasta:</strong> Shared Documents / RH_COLAB</p>
            <p><strong>Prefixo:</strong> <code className="text-xs bg-muted px-1 rounded">base_colab_</code></p>
            <p><strong>Frequência:</strong> Todos os dias às 12:00 UTC (09:00 BRT)</p>
          </div>
          <Button onClick={handleSharePointSync} disabled={spSyncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${spSyncing ? "animate-spin" : ""}`} />{spSyncing ? "Buscando no SharePoint..." : "Executar Agora"}
          </Button>
          {showCsvProgress && <CsvProgressPanel job={csvJob} />}
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
  const isDone = job.status === "done";
  const isError = job.status === "error";
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
      {isError && job.error && <p className="text-sm text-destructive">{job.error}</p>}
      {job.filename && <p className="text-xs text-muted-foreground">Arquivo: {job.filename}</p>}
    </div>
  );
}
