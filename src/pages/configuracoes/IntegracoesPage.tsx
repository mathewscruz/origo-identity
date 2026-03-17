import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, CheckCircle, AlertCircle, Cloud, Users, AppWindow } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSyncJobs } from "@/hooks/useOrigoData";

export default function IntegracoesPage() {
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const { data: job, refetch } = useSyncJobs();

  // Detect if there's an ongoing job on mount
  useEffect(() => {
    if (job?.status === "running") {
      setSyncing(true);
    } else {
      setSyncing(false);
    }
  }, [job?.status]);

  const handleSync = useCallback(async () => {
    setSyncing(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-entra-id`;
      // Fire the request — we don't need to read the full stream.
      // The edge function writes progress to sync_jobs table.
      // We just need to start it.
      fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      }).then(async (res) => {
        if (!res.ok) {
          toast({ title: "Erro na sincronização", description: `HTTP ${res.status}`, variant: "destructive" });
        }
        // Read through the stream to keep the connection alive
        if (res.body) {
          const reader = res.body.getReader();
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
        refetch();
      }).catch((err) => {
        toast({ title: "Erro na sincronização", description: err.message, variant: "destructive" });
        setSyncing(false);
      });

      // Start polling after a small delay
      setTimeout(() => refetch(), 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro na sincronização", description: msg, variant: "destructive" });
      setSyncing(false);
    }
  }, [toast, refetch]);

  const showProgress = !!job && (job.status === "running" || job.status === "done" || job.status === "error");
  const isDone = job?.status === "done";
  const isError = job?.status === "error";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Microsoft Entra ID</CardTitle>
              <CardDescription>Sincronize usuários e aplicações do Azure AD</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Importa usuários do Entra ID como colaboradores e App Registrations como aplicações.
            A sincronização faz upsert — registros existentes são atualizados, novos são criados.
          </p>

          <Button onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Agora"}
          </Button>

          {showProgress && (
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
                    <span className="font-medium">Usuários</span>
                  </div>
                  <span className="text-muted-foreground">{job.users_percent || 0}%</span>
                </div>
                <Progress value={job.users_percent || 0} className="h-2" />
                {(job.users_total ?? 0) > 0 && (
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                      {job.users_created || 0} novos
                    </Badge>
                    <Badge variant="outline">
                      {job.users_updated || 0} atualizados
                    </Badge>
                    <span className="text-muted-foreground">{job.users_total} total</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <AppWindow className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Aplicações</span>
                  </div>
                  <span className="text-muted-foreground">{job.apps_percent || 0}%</span>
                </div>
                <Progress value={job.apps_percent || 0} className="h-2" />
                {(job.apps_total ?? 0) > 0 && (
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                      {job.apps_created || 0} novas
                    </Badge>
                    <Badge variant="outline">
                      {job.apps_updated || 0} atualizadas
                    </Badge>
                    <span className="text-muted-foreground">{job.apps_total} total</span>
                  </div>
                )}
              </div>

              {isError && job.error && (
                <p className="text-sm text-destructive">{job.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
