import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Shield, Plug, FolderOpen, Bot } from "lucide-react";
import { AutoUpdatedHint } from "@/components/AutoUpdatedHint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAgentStatus } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/EmptyState";
import { authedFetch } from "@/lib/authedFetch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

function relTime(iso?: string | null) {
  if (!iso) return "nunca";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

async function callFunction(name: string, body?: unknown): Promise<{ ok: boolean; status: number; body: Row }> {
  const res = await authedFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? "{}" : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Row = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok || res.status === 202, status: res.status, body: parsed };
}

export default function IntegracoesPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const setB = (k: string, v: boolean) => setBusy((b) => ({ ...b, [k]: v }));

  const { data: agents } = useAgentStatus();
  const { data: connectorStats } = useQuery({
    queryKey: ["aplicacoes_connectors"],
    queryFn: async () => { const { data, error } = await (supabase as Row).from("aplicacoes").select("id, nome, connector_type").neq("connector_type", "manual"); if (error) throw error; return (data ?? []) as Row[]; },
  });


  const run = useCallback(async (key: string, fn: string, body: unknown, okMsg: (b: Row) => string) => {
    setB(key, true);
    try {
      const r = await callFunction(fn, body);
      if (!r.ok) toast({ title: "Erro", description: r.body?.error || `HTTP ${r.status}`, variant: "destructive" });
      else toast({ title: okMsg(r.body) });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally { setB(key, false); }
  }, [toast]);


  const agent = agents?.[0];
  const agentAge = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;

  return (
    <div className="space-y-4">
      {/* Catálogo Entra / SharePoint */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-primary/20">
          <CardHeader><div className="flex items-center gap-3"><Shield className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Grupos do Entra ID</CardTitle><CardDescription>Grupos da Microsoft usados nos perfis de acesso. Atualizado automaticamente pelo Hermes.</CardDescription></div></div></CardHeader>
          <CardContent><AutoUpdatedHint tasks="sync-entra-groups" /></CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardHeader><div className="flex items-center gap-3"><FolderOpen className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Sites do SharePoint</CardTitle><CardDescription>Sites e pastas usados nos perfis de acesso. Atualizado automaticamente pelo Hermes.</CardDescription></div></div></CardHeader>
          <CardContent><AutoUpdatedHint tasks="sync-sharepoint-sites" /></CardContent>
        </Card>
      </div>

      {/* Conectores */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Plug className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Conectores de aplicações</CardTitle><CardDescription>Sistemas em que o Hermes cria e desativa usuários diretamente.</CardDescription></div>
            <Badge className="ml-auto" variant="outline">{(connectorStats || []).length} ativo(s)</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(connectorStats || []).length === 0 ? <EmptyState message="Nenhuma aplicação com conector. Configure na página de detalhe da aplicação." /> : (
            <div className="space-y-2">
              {(connectorStats || []).map((app: Row) => (
                <div key={app.id} className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50" onClick={() => navigate(`/aplicacoes/${app.id}`)}>
                  <span className="font-medium">{app.nome}</span>
                  <Badge variant="outline" className="border-success/30 bg-success/15 text-success">Conectado</Badge>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/aplicacoes")}>Ver aplicações</Button>
        </CardContent>
      </Card>

    </div>
  );
}
