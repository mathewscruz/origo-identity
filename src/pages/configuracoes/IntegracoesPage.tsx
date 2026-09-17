import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, CheckCircle, AlertCircle, Cloud, Users, FileUp, AlertTriangle, FileSpreadsheet, Shield, Plug, FolderOpen, Bot, Eye, Check, X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAgentStatus, useColabQuarentena, useParametro, useSyncJob } from "@/hooks/useOrigoData";
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
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<Row | null>(null);
  const setB = (k: string, v: boolean) => setBusy((b) => ({ ...b, [k]: v }));

  const { data: csvJob } = useSyncJob("csv_colab");
  const { data: reconcileJob } = useSyncJob("reconcile_identities");
  const { data: dailyJob } = useSyncJob("daily_cycle");
  const { data: agents } = useAgentStatus();
  const { data: quarentena } = useColabQuarentena();
  const spSite = useParametro("sharepoint_rh_site", "origoenergia.sharepoint.com:/sites/dataanalytics");
  const spPasta = useParametro("sharepoint_rh_pasta", "RH_COLAB");
  const spPrefixo = useParametro("sharepoint_rh_prefixo", "base_colab_");

  const { data: reconcileStats } = useQuery({
    queryKey: ["colaboradores_reconcile_stats"],
    queryFn: async () => {
      const [{ count: total }, { count: linked }, { count: desligados }, { count: aReconciliar }] = await Promise.all([
        (supabase as Row).from("colaboradores").select("id", { count: "exact", head: true }),
        (supabase as Row).from("colaboradores").select("id", { count: "exact", head: true }).not("entra_id", "is", null),
        (supabase as Row).from("colaboradores").select("id", { count: "exact", head: true }).in("status", ["desligado", "inativo"]),
        (supabase as Row).from("colaboradores").select("id", { count: "exact", head: true }).eq("status", "ativo").is("entra_id", null).not("email", "is", null),
      ]);
      return { total: total || 0, linked: linked || 0, desligados: desligados || 0, aReconciliar: aReconciliar || 0 };
    },
  });
  const { data: connectorStats } = useQuery({
    queryKey: ["aplicacoes_connectors"],
    queryFn: async () => { const { data, error } = await (supabase as Row).from("aplicacoes").select("id, nome, connector_type").neq("connector_type", "manual"); if (error) throw error; return (data ?? []) as Row[]; },
  });

  const isStale = (job: Row, minutes: number) => job?.status === "running" && job?.updated_at && Date.now() - new Date(job.updated_at).getTime() > minutes * 60_000;
  const running = (job: Row, minutes: number) => job?.status === "running" && !isStale(job, minutes);

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

  const uploadCsv = useCallback(async (file: File, dryRun: boolean) => {
    setB("csv", true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await authedFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-csv-colab${dryRun ? "?dry_run=1" : ""}`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: "Erro na importação", description: body?.error || `HTTP ${res.status}`, variant: "destructive" }); return; }
      if (dryRun) setPreview({ ...body, filename: file.name });
      else toast({ title: "Importação concluída", description: `${body.created ?? 0} novos · ${body.updated ?? 0} atualizados · ${body.removed ?? 0} desligados · ${body.quarantined ?? 0} em quarentena` });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally { setB("csv", false); }
  }, [toast]);

  const decideQuarentena = async (row: Row, status: "resolvido" | "descartado") => {
    const { data, error } = await supabase.rpc("quarentena_decidir", { p_id: row.id, p_status: status });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || res?.ok === false) { toast({ title: "Erro", description: error?.message || res?.error || "Erro", variant: "destructive" }); return; }
    toast({ title: status === "resolvido" ? "Marcado como resolvido" : "Descartado", description: row.nome || row.matricula || undefined });
    qc.invalidateQueries({ queryKey: ["colab_quarentena"] });
  };

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

      {/* Ciclo diário / RH */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Base do RH — SharePoint</CardTitle><CardDescription>Ciclo diário automático às 06:30 UTC: busca o CSV mais recente → importa (joiners, movers, leavers com limite de segurança, quarentena) → reconcilia com o Entra ID → fila para o agente.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-1 text-sm text-muted-foreground md:grid-cols-3">
            <p><strong>Site:</strong> {spSite}</p><p><strong>Pasta:</strong> Documentos / {spPasta}</p><p><strong>Prefixo:</strong> <code className="rounded bg-muted px-1 text-xs">{spPrefixo}</code></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run("cycle", "run-daily-cycle", { skip_csv: false }, (b) => b.already_running ? "Ciclo já em andamento" : "Ciclo diário iniciado")} disabled={busy.cycle || running(dailyJob, 30)}>
              <RefreshCw className={`mr-2 h-4 w-4 ${busy.cycle || running(dailyJob, 30) ? "animate-spin" : ""}`} />{running(dailyJob, 30) ? "Ciclo em andamento…" : "Rodar ciclo diário agora"}
            </Button>
            <Button variant="outline" onClick={() => run("sp", "sync-sharepoint-csv", {}, (b) => `Importação iniciada: ${b.file || "arquivo mais recente"}`)} disabled={busy.sp || running(csvJob, 10)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />Só importar o CSV
            </Button>
            <Button variant="outline" onClick={() => run("recon", "reconcile-identities", {}, (b) => b.already_running ? "Reconciliação já em andamento" : "Reconciliação iniciada")} disabled={busy.recon || running(reconcileJob, 15)}>
              <Users className="mr-2 h-4 w-4" />Só reconciliar identidades
            </Button>
          </div>
          {reconcileStats && (
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <div className="rounded border bg-background p-2"><div className="text-muted-foreground">Colaboradores</div><div className="text-lg font-semibold">{reconcileStats.total}</div></div>
              <div className="rounded border bg-background p-2"><div className="text-muted-foreground">Vinculados ao Entra</div><div className="text-lg font-semibold text-emerald-600">{reconcileStats.linked}</div></div>
              <div className="rounded border bg-background p-2"><div className="text-muted-foreground">Ativos sem vínculo</div><div className="text-lg font-semibold text-amber-600">{reconcileStats.aReconciliar}</div></div>
              <div className="rounded border bg-background p-2"><div className="text-muted-foreground">Desligados / inativos</div><div className="text-lg font-semibold text-red-600">{reconcileStats.desligados}</div></div>
            </div>
          )}
          {dailyJob && <JobPanel job={dailyJob} label="Ciclo diário" staleMinutes={30} />}
          {csvJob && (dailyJob?.status !== "running") && <CsvPanel job={csvJob} />}
          {reconcileJob && (dailyJob?.status !== "running") && <JobPanel job={reconcileJob} label="Reconciliação" staleMinutes={15} />}
        </CardContent>
      </Card>

      {/* Quarentena */}
      <Card className={(quarentena?.length ?? 0) > 0 ? "border-warning/40" : ""}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-5 w-5 ${(quarentena?.length ?? 0) > 0 ? "text-warning" : "text-muted-foreground"}`} />
            <div><CardTitle className="text-base">Quarentena da importação</CardTitle><CardDescription>Linhas do RH que não viraram identidade (sem matrícula, duplicadas, ausentes com limite de segurança acionado). Corrija na base do RH; a próxima importação reavalia.</CardDescription></div>
            <Badge variant="outline" className="ml-auto">{quarentena?.length ?? 0} pendente(s)</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {(quarentena?.length ?? 0) === 0 ? <div className="py-6"><EmptyState message="Nada em quarentena." /></div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="p-3 font-medium">Pessoa</th><th className="p-3 font-medium">Motivo</th><th className="p-3 font-medium hidden md:table-cell">Detalhe</th><th className="p-3 font-medium">Quando</th><th className="p-3"></th></tr></thead>
              <tbody>
                {(quarentena ?? []).slice(0, 100).map((q: Row) => (
                  <tr key={q.id} className="border-b last:border-0">
                    <td className="p-3"><div className="font-medium">{q.nome || "—"}</div><div className="text-xs text-muted-foreground">{q.matricula ? `mat. ${q.matricula}` : ""}{q.email ? ` · ${q.email}` : ""}</div></td>
                    <td className="p-3"><Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">{String(q.motivo || "").replace(/_/g, " ")}</Badge></td>
                    <td className="p-3 hidden md:table-cell max-w-[360px] truncate text-xs text-muted-foreground" title={q.detalhe || ""}>{q.detalhe || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{relTime(q.created_at)}</td>
                    <td className="p-3"><div className="flex justify-end gap-1">
                      {q.colaborador_id && <Button variant="ghost" size="sm" className="h-7" onClick={() => navigate(`/colaboradores/${q.colaborador_id}`)}><Eye className="h-3.5 w-3.5" /></Button>}
                      <Button variant="ghost" size="sm" className="h-7 text-success" title="Resolvido (corrigido no RH)" onClick={() => decideQuarentena(q, "resolvido")}><Check className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" title="Descartar" onClick={() => decideQuarentena(q, "descartado")}><X className="h-3.5 w-3.5" /></Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* Upload manual */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileUp className="h-5 w-5 text-primary" />
            <div><CardTitle className="text-base">Importação manual (contingência)</CardTitle><CardDescription>Mesmo motor da importação automática. Use "Pré-visualizar" para ver o que mudaria sem gravar nada.</CardDescription></div>
            <Badge className="ml-auto" variant="outline">Fallback</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCsv(f, (fileInputRef.current?.dataset.mode || "preview") === "preview"); e.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy.csv} onClick={() => { if (fileInputRef.current) { fileInputRef.current.dataset.mode = "preview"; fileInputRef.current.click(); } }}><Eye className="mr-2 h-4 w-4" />Pré-visualizar CSV</Button>
            <Button disabled={busy.csv} onClick={() => { if (fileInputRef.current) { fileInputRef.current.dataset.mode = "apply"; fileInputRef.current.click(); } }}><FileUp className={`mr-2 h-4 w-4 ${busy.csv ? "animate-spin" : ""}`} />Importar CSV</Button>
          </div>
          {preview && (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-2 flex items-center justify-between"><span className="font-medium">Pré-visualização — {preview.filename}</span><Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Fechar</Button></div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className="border-success/30 bg-success/10 text-success">{preview.created ?? 0} novos</Badge>
                <Badge variant="outline">{preview.updated ?? 0} atualizados</Badge>
                <Badge variant="outline">{preview.unchanged ?? 0} sem mudança</Badge>
                <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">{preview.removed ?? 0} desligamentos</Badge>
                <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">{preview.quarantined ?? 0} quarentena</Badge>
                {preview.rehired ? <Badge variant="outline">{preview.rehired} recontratações</Badge> : null}
                {preview.leaverGuardTriggered && <Badge variant="destructive">Limite de desligamentos seria acionado</Badge>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{preview.total ?? 0} linha(s) válidas de {preview.rawTotal ?? 0}. Nada foi gravado.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CsvPanel({ job }: { job: Row }) {
  const isDone = job.status === "done"; const isError = job.status === "error"; const isRunning = job.status === "running";
  const isStale = isRunning && Date.now() - new Date(job.updated_at || 0).getTime() > 10 * 60_000;
  const recent = Date.now() - new Date(job.updated_at || job.created_at).getTime() < 2 * 3600_000;
  if (!recent && !isRunning) return null;
  return (
    <div className="space-y-3 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-sm">
        {isError ? <AlertCircle className="h-4 w-4 text-destructive" /> : isDone ? <CheckCircle className="h-4 w-4 text-success" /> : <RefreshCw className="h-4 w-4 animate-spin text-primary" />}
        <span className="font-medium">Importação: {job.message || "Iniciando…"}</span>
        <span className="ml-auto text-xs text-muted-foreground">{relTime(job.updated_at)}</span>
      </div>
      <Progress value={job.colab_percent || 0} className="h-2" />
      {(job.colab_total ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-success/30 bg-success/15 text-success">{job.colab_created || 0} novos</Badge>
          <Badge variant="outline">{job.colab_updated || 0} atualizados</Badge>
          {(job.colab_inativos ?? 0) > 0 && <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-destructive">{job.colab_inativos} desligados</Badge>}
          {(job.colab_quarentena ?? 0) > 0 && <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning">{job.colab_quarentena} quarentena</Badge>}
          <span className="text-muted-foreground">{job.colab_total} no arquivo</span>
        </div>
      )}
      {isStale && <p className="text-xs text-warning">Sem atualização há mais de 10 min — a função pode ter sido interrompida; rode novamente.</p>}
      {isError && job.error && <p className="text-sm text-destructive">{job.error}</p>}
      {job.filename && <p className="text-xs text-muted-foreground">Arquivo: {job.filename}</p>}
    </div>
  );
}

function JobPanel({ job, label, staleMinutes }: { job: Row; label: string; staleMinutes: number }) {
  const isDone = job.status === "done"; const isError = job.status === "error"; const isRunning = job.status === "running";
  const isStale = isRunning && Date.now() - new Date(job.updated_at || 0).getTime() > staleMinutes * 60_000;
  const recent = Date.now() - new Date(job.updated_at || job.created_at).getTime() < 24 * 3600_000;
  if (!recent && !isRunning) return null;
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2 text-sm">
        {isError ? <AlertCircle className="h-4 w-4 text-destructive" /> : isDone ? <CheckCircle className="h-4 w-4 text-success" /> : <RefreshCw className="h-4 w-4 animate-spin text-primary" />}
        <span className="font-medium">{label}: {job.message || job.phase || "iniciando…"}</span>
        <span className="ml-auto text-xs text-muted-foreground">{relTime(job.updated_at)}</span>
      </div>
      <Progress value={job.users_percent || 0} className="h-2" />
      {isStale && <p className="text-xs text-warning">Sem atualização há mais de {staleMinutes} min — rode novamente.</p>}
      {isError && job.error && <p className="text-xs text-destructive">{job.error}</p>}
    </div>
  );
}
