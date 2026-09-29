import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Shield, Plug, FolderOpen, Bot } from "lucide-react";
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
      {/* Executor */}
      <Card className={`${!agent || agentAge > 30 ? "border-destructive/30" : agentAge > 5 ? "border-warning/30" : "border-success/30"}`}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Bot className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Órigo Agente — executor único</CardTitle><CardDescription>Consome a fila via iam-agent-api e executa em AD, Entra ID, SharePoint e apps. Nenhuma função do sistema executa ações em diretório.</CardDescription></div>
            <Badge variant="outline" className={`ml-auto ${!agent || agentAge > 30 ? "border-destructive/30 bg-destructive/10 text-destructive" : agentAge > 5 ? "border-warning/30 bg-warning/10 text-warning" : "border-success/30 bg-success/10 text-success"}`}>
              {!agent ? "nunca visto" : agentAge <= 5 ? "online" : agentAge <= 30 ? "sem sinal" : "offline"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {agent ? (
            <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
              <div><p className="text-muted-foreground">Executor</p><p className="font-medium">{agent.owner}</p></div>
              <div><p className="text-muted-foreground">Versão / host</p><p className="font-medium">{agent.version || "?"} · {agent.host || "?"}</p></div>
              <div><p className="text-muted-foreground">Modo</p><p className="font-medium">{agent.execute_mode === false ? "dry-run (nada é aplicado)" : "executando"}</p></div>
              <div><p className="text-muted-foreground">Último contato</p><p className="font-medium">{relTime(agent.last_seen_at)}</p></div>
              <div><p className="text-muted-foreground">Último resultado</p><p className="font-medium truncate" title={agent.last_result || ""}>{agent.last_result ? `${agent.last_result} (${relTime(agent.last_result_at)})` : "—"}</p></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">O agente ainda não chamou a API. Configure <code className="rounded bg-muted px-1">IAM_AGENT_API_URL</code> e <code className="rounded bg-muted px-1">IAM_AGENT_TOKEN</code> no host do agente e execute <code className="rounded bg-muted px-1">python agent/origo_iam_agent_executor.py --execute</code>.</p>
          )}
        </CardContent>
      </Card>


      {/* Catálogo Entra / SharePoint */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-primary/20">
          <CardHeader><div className="flex items-center gap-3"><Shield className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Grupos do Entra ID</CardTitle><CardDescription>Catálogo de grupos (cloud e on-premises) usado nos perfis de acesso. Somente leitura do Graph.</CardDescription></div></div></CardHeader>
          <CardContent><Button onClick={() => run("groups", "sync-entra-groups", {}, (b) => `${b.total ?? 0} grupos (${b.cloudOnly ?? 0} cloud, ${b.onPremises ?? 0} on-prem)`)} disabled={busy.groups}><RefreshCw className={`mr-2 h-4 w-4 ${busy.groups ? "animate-spin" : ""}`} />Sincronizar grupos</Button></CardContent>
        </Card>
        <Card className="border-primary/20">
          <CardHeader><div className="flex items-center gap-3"><FolderOpen className="h-5 w-5 text-primary" /><div><CardTitle className="text-base">Sites do SharePoint</CardTitle><CardDescription>Sites e pastas (2 níveis) para os perfis de acesso. Somente leitura do Graph.</CardDescription></div></div></CardHeader>
          <CardContent><Button onClick={() => run("sites", "sync-sharepoint-sites", {}, (b) => `${b.sites ?? 0} sites importados`)} disabled={busy.sites}><RefreshCw className={`mr-2 h-4 w-4 ${busy.sites ? "animate-spin" : ""}`} />Sincronizar sites</Button></CardContent>
        </Card>
      </div>

      {/* Conectores */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Plug className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Conectores de aplicações</CardTitle><CardDescription>Apps externos (REST/SCIM) provisionados pelo agente via create/update/disable_user_app.</CardDescription></div>
            <Badge className="ml-auto" variant="outline">{(connectorStats || []).length} ativo(s)</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(connectorStats || []).length === 0 ? <EmptyState message="Nenhuma aplicação com conector. Configure na página de detalhe da aplicação." /> : (
            <div className="space-y-2">
              {(connectorStats || []).map((app: Row) => (
                <div key={app.id} className="flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50" onClick={() => navigate(`/aplicacoes/${app.id}`)}>
                  <span className="font-medium">{app.nome}</span>
                  <Badge variant="outline" className="border-success/30 bg-success/15 text-success">{app.connector_type === "rest_api" ? "REST API" : app.connector_type === "scim" ? "SCIM" : app.connector_type}</Badge>
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
