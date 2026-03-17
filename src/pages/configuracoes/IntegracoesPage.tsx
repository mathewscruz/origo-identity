import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RefreshCw, CheckCircle, AlertCircle, Cloud, Users, AppWindow } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SyncCounts {
  total: number;
  created: number;
  updated: number;
}

interface SyncState {
  phase: string;
  message: string;
  usersPercent: number;
  appsPercent: number;
  usersCounts: SyncCounts | null;
  appsCounts: SyncCounts | null;
  done: boolean;
  error: string | null;
}

const initialState: SyncState = {
  phase: "",
  message: "",
  usersPercent: 0,
  appsPercent: 0,
  usersCounts: null,
  appsCounts: null,
  done: false,
  error: null,
};

export default function IntegracoesPage() {
  const [syncing, setSyncing] = useState(false);
  const [state, setState] = useState<SyncState>(initialState);
  const { toast } = useToast();

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setState(initialState);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-entra-id`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const chunk of lines) {
          const dataLine = chunk.replace(/^data: /, "").trim();
          if (!dataLine) continue;

          try {
            const evt = JSON.parse(dataLine);

            setState((prev) => {
              const next = { ...prev };

              if (evt.message) next.message = evt.message;

              if (evt.phase === "sync_users") {
                next.phase = "sync_users";
                next.usersPercent = evt.percent ?? prev.usersPercent;
                next.usersCounts = { total: evt.total, created: evt.created, updated: evt.updated };
              } else if (evt.phase === "sync_apps") {
                next.phase = "sync_apps";
                next.appsPercent = evt.percent ?? prev.appsPercent;
                next.appsCounts = { total: evt.total, created: evt.created, updated: evt.updated };
              } else if (evt.phase === "fetch_users_done") {
                next.message = evt.message;
              } else if (evt.phase === "fetch_apps_done") {
                next.message = evt.message;
              } else if (evt.phase === "done") {
                next.done = true;
                next.usersPercent = 100;
                next.appsPercent = 100;
                next.usersCounts = evt.users;
                next.appsCounts = evt.apps;
                next.message = "Sincronização concluída!";
              } else if (evt.phase === "error") {
                next.error = evt.error;
                next.done = true;
              }

              return next;
            });
          } catch {
            // ignore malformed JSON
          }
        }
      }

      setState((prev) => {
        if (prev.done && !prev.error) {
          toast({
            title: "Sincronização concluída",
            description: `${prev.usersCounts?.total ?? 0} usuários e ${prev.appsCounts?.total ?? 0} aplicações processados.`,
          });
        } else if (prev.error) {
          toast({ title: "Erro na sincronização", description: prev.error, variant: "destructive" });
        }
        return prev;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setState((prev) => ({ ...prev, error: msg, done: true }));
      toast({ title: "Erro na sincronização", description: msg, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  const showProgress = syncing || state.done;

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
              {/* Status header */}
              <div className="flex items-center gap-2">
                {state.error ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : state.done ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                )}
                <span className="font-medium text-sm">{state.message || "Iniciando..."}</span>
              </div>

              {/* Users progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Usuários</span>
                  </div>
                  <span className="text-muted-foreground">{state.usersPercent}%</span>
                </div>
                <Progress value={state.usersPercent} className="h-2" />
                {state.usersCounts && (
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                      {state.usersCounts.created} novos
                    </Badge>
                    <Badge variant="outline">
                      {state.usersCounts.updated} atualizados
                    </Badge>
                    <span className="text-muted-foreground">{state.usersCounts.total} total</span>
                  </div>
                )}
              </div>

              {/* Apps progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <AppWindow className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Aplicações</span>
                  </div>
                  <span className="text-muted-foreground">{state.appsPercent}%</span>
                </div>
                <Progress value={state.appsPercent} className="h-2" />
                {state.appsCounts && (
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                      {state.appsCounts.created} novas
                    </Badge>
                    <Badge variant="outline">
                      {state.appsCounts.updated} atualizadas
                    </Badge>
                    <span className="text-muted-foreground">{state.appsCounts.total} total</span>
                  </div>
                )}
              </div>

              {/* Error */}
              {state.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
