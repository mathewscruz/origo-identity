import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, AlertCircle, Cloud } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SyncResult {
  success: boolean;
  error?: string;
  users?: { total: number; created: number; updated: number };
  apps?: { total: number; created: number; updated: number };
}

export default function IntegracoesPage() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const { toast } = useToast();

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("sync-entra-id");

      if (error) throw error;

      const res = data as SyncResult;
      setResult(res);

      if (res.success) {
        toast({
          title: "Sincronização concluída",
          description: `${res.users?.total ?? 0} usuários e ${res.apps?.total ?? 0} aplicações processados.`,
        });
      } else {
        toast({ title: "Erro na sincronização", description: res.error, variant: "destructive" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setResult({ success: false, error: msg });
      toast({ title: "Erro na sincronização", description: msg, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

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

          {result && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium text-sm">
                  {result.success ? "Sincronização concluída" : "Erro na sincronização"}
                </span>
              </div>

              {result.success && result.users && result.apps && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="font-medium">Usuários</p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                        {result.users.created} novos
                      </Badge>
                      <Badge variant="outline">
                        {result.users.updated} atualizados
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{result.users.total} total no Entra ID</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">Aplicações</p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                        {result.apps.created} novas
                      </Badge>
                      <Badge variant="outline">
                        {result.apps.updated} atualizadas
                      </Badge>
                    </div>
                    <p className="text-muted-foreground">{result.apps.total} total no Entra ID</p>
                  </div>
                </div>
              )}

              {result.error && (
                <p className="text-sm text-destructive">{result.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
