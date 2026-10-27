import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Pause, Play, PlayCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAgentStatus, useParametro } from "@/hooks/useOrigoData";
import { useAuth } from "@/contexts/AuthContext";
import { useIsSuperAdmin } from "@/hooks/useRole";
import { useToast } from "@/hooks/use-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const ROTINAS = [
  { fn: "sync-sharepoint-csv", label: "Importação da base do RH", when: "todo dia, 03:30", daily: true },
  { fn: "reconcile-identities", label: "Reconciliação base × Entra", when: "após a importação" },
  { fn: "expire-access-exceptions", label: "Expiração de exceções", when: "todo dia, 02:00", daily: true },
  { fn: "auto-recertification", label: "Recertificação e terceiros", when: "todo dia, 02:15", daily: true },
  { fn: "audit-reconciliation", label: "Auditoria da reconciliação", when: "domingo, 01:00" },
  { fn: "quarantine-triage", label: "Triagem da quarentena do RH", when: "ao abrir Pessoas" },
  { fn: "sync-entra-groups", label: "Sincronizar grupos do Entra", when: "ao abrir a página" },
  { fn: "sync-entra-licencas", label: "Sincronizar licenças do Entra", when: "ao abrir a página" },
  { fn: "sync-entra-roles", label: "Sincronizar roles privilegiadas", when: "ao abrir a página" },
  { fn: "sync-service-accounts", label: "Verificar contas de serviço", when: "ao abrir a página" },
];
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Aguardando agente", cls: "border-warning/30 bg-warning/10 text-warning" },
  running: { label: "Executando", cls: "border-primary/30 bg-primary/10 text-primary" },
  done: { label: "Concluída", cls: "border-success/30 bg-success/10 text-success" },
  error: { label: "Erro", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
};

function rel(iso?: string | null) {
  if (!iso) return "nunca";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora"; if (m < 60) return `há ${m} min`; if (m < 1440) return `há ${Math.floor(m / 60)} h`; return `há ${Math.floor(m / 1440)} d`;
}

export default function AgentePage() {
  const { role, profile } = useAuth();
  const canEdit = useIsSuperAdmin();
  const isAdmin = role === "admin" || role === "platform_admin";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: agents } = useAgentStatus();
  const paused = useParametro("agent_paused", "false") === "true";
  const expected = useParametro("agent_expected_version", "");
  const [confirmPause, setConfirmPause] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: tasks } = useQuery({
    queryKey: ["agent_tasks"],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 15000,
  });
  const { data: lastRuns } = useQuery({
    queryKey: ["auditoria_agent_task"],
    queryFn: async () => {
      const { data } = await (supabase as Row).from("auditoria").select("timestamp, resumo").eq("acao", "agent_task").order("timestamp", { ascending: false }).limit(200);
      const last: Record<string, string> = {};
      for (const r of (data ?? []) as Row[]) { const fn = String(r.resumo || "").replace("Hermes disparou ", ""); if (!last[fn]) last[fn] = r.timestamp; }
      return last;
    },
    refetchInterval: 30000,
  });

  const agent = (agents ?? []).find((a: Row) => !String(a.owner).includes("diagnostic")) ?? agents?.[0];
  const ageMin = agent ? (Date.now() - new Date(agent.last_seen_at).getTime()) / 60000 : Infinity;
  const online = ageMin <= 5;
  const versionMismatch = !!expected && !!agent?.version && agent.version !== expected;

  const executar = async (fn: string) => {
    setBusy(fn);
    const { error } = await (supabase as Row).rpc("agent_task_solicitar", { p_task: fn });
    setBusy(null);
    if (error) return toast({ title: "Não foi possível solicitar", description: error.message, variant: "destructive" });
    toast({ title: "Pedido enviado ao Hermes", description: "O agente executa no próximo ciclo." });
    qc.invalidateQueries({ queryKey: ["agent_tasks"] });
  };

  const togglePause = async () => {
    const valor = paused ? "false" : "true";
    const { error } = await supabase.from("parametros").update({ valor }).eq("chave", "agent_paused");
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    await supabase.from("auditoria").insert({ entidade: "parametros", acao: valor === "true" ? "agente_pausado" : "agente_retomado", operador: profile?.email || "sistema", resumo: valor === "true" ? "Hermes pausado pela tela" : "Hermes retomado pela tela" });
    qc.invalidateQueries({ queryKey: ["parametros"] });
    setConfirmPause(false);
    toast({ title: valor === "true" ? "Agente pausado" : "Agente retomado" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-4 w-4" /></div>
              <div><CardTitle className="text-base">Hermes Agent</CardTitle><CardDescription>Único executor do sistema: fila, rotinas e sincronizações.</CardDescription></div>
            </div>
            {isAdmin && (
              <Button variant={paused ? "default" : "outline"} size="sm" onClick={() => paused ? togglePause() : setConfirmPause(true)}>
                {paused ? <><Play className="mr-1 h-4 w-4" />Retomar agente</> : <><Pause className="mr-1 h-4 w-4" />Pausar agente</>}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Situação</p>
            <p className="font-medium">{paused ? <span className="text-warning">Pausado</span> : !agent ? "Nunca visto" : online ? <span className="text-success">Online</span> : <span className="text-destructive">Sem sinal {rel(agent.last_seen_at)}</span>}</p></div>
          <div><p className="text-xs text-muted-foreground">Modo</p><p className="font-medium">{agent?.execute_mode ? "Execução real" : "Simulação"}</p></div>
          <div><p className="text-xs text-muted-foreground">Versão · servidor</p>
            <p className="font-mono text-xs">{agent?.version ?? "—"}{versionMismatch && <Badge variant="outline" className="ml-2 border-destructive/30 bg-destructive/10 text-destructive">esperada {expected}</Badge>}</p>
            <p className="text-xs text-muted-foreground">{agent?.host ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Último resultado</p><p className="truncate text-xs" title={agent?.last_result ?? ""}>{agent?.last_result ?? "—"}</p><p className="text-xs text-muted-foreground">{rel(agent?.last_result_at)}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Rotinas</CardTitle><CardDescription>Tudo roda automaticamente: rotinas diárias pela agenda do Hermes e atualizações sempre que uma página é aberta ou um dado é alterado.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="p-3 font-medium">Rotina</th><th className="p-3 font-medium">Horário</th><th className="p-3 font-medium">Último disparo</th><th className="p-3 font-medium">Situação</th></tr></thead>
            <tbody>
              {ROTINAS.map((r) => {
                const last = lastRuns?.[r.fn];
                const late = (r as { daily?: boolean }).daily && (!last || Date.now() - new Date(last).getTime() > 26 * 3600000);
                const open = (tasks ?? []).some((t) => t.task === r.fn && (t.status === "pending" || t.status === "running"));
                return (
                  <tr key={r.fn} className="border-b last:border-0">
                    <td className="p-3">{r.label}<div className="font-mono text-[10px] text-muted-foreground">{r.fn}</div></td>
                    <td className="p-3 text-xs">{r.when}</td>
                    <td className="p-3 text-xs">{last ? new Date(last).toLocaleString("pt-BR") : "—"}{late && <Badge variant="outline" className="ml-2 border-destructive/30 bg-destructive/10 text-destructive">atrasada</Badge>}</td>
                    <td className="p-3 text-xs">{open ? <Badge variant="outline" className={STATUS.running.cls}>Em andamento</Badge> : paused ? "Pausado" : "Automático"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pedidos recentes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(tasks ?? []).length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum pedido ainda.</p> : (
            <table className="w-full text-sm"><tbody>
              {(tasks ?? []).map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{t.task}</td>
                  <td className="p-3"><Badge variant="outline" className={STATUS[t.status]?.cls}>{STATUS[t.status]?.label ?? t.status}</Badge></td>
                  <td className="p-3 text-xs text-muted-foreground">{t.requested_by} · {rel(t.created_at)}</td>
                  <td className="p-3 max-w-[280px] truncate text-xs text-muted-foreground" title={t.result ?? ""}>{t.http_status ? `HTTP ${t.http_status} · ` : ""}{t.result ?? ""}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmPause} onOpenChange={setConfirmPause}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Pausar o Hermes?</AlertDialogTitle>
            <AlertDialogDescription>O agente para de executar itens da fila e rotinas até ser retomado. Ele continua enviando sinal de vida. Use em emergência.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={togglePause}>Pausar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
