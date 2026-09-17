import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, CheckCircle2, Copy, ExternalLink, Loader2, Search, Send, X, XCircle, CheckSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { useRevisao, useRevisaoItens } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import { useToast } from "@/hooks/use-toast";
import { useCanEdit } from "@/hooks/useRole";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotificationEmail } from "@/lib/sendNotificationEmail";
import { actionLabel, QUEUE_STATUS_META, statusLabel } from "@/lib/queueLabels";
import { humanize } from "@/lib/labels";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const STATUS: Record<string, { label: string; className: string }> = {
  em_andamento: { label: "Em andamento", className: "bg-info/15 text-info border-info/30" },
  concluida: { label: "Concluída", className: "bg-success/15 text-success border-success/30" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

/** Itens da fila gerados pela conclusão desta revisão (requested_by = revisao:<id>). */
function useRevisaoExecucao(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["iam_queue_revisao", id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("iam_queue").select("id, action_type, status, target_identity, payload_json, result_message, error_code, processed_at").eq("requested_by", `revisao:${id}`).order("created_at");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

export default function RevisaoDetalhePage() {
  const { id } = useParams();
  const { data: revisao, isLoading } = useRevisao(id);
  const { data: itens } = useRevisaoItens(id);
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"concluir" | "cancelar" | null>(null);
  const [justif, setJustif] = useState<Record<string, string>>({});
  const isAtiva = revisao?.status === "em_andamento";
  const { data: execucao } = useRevisaoExecucao(id, revisao?.status === "concluida");

  const lista = useMemo(() => ((itens || []) as Row[]).filter((it) => {
    if (filtro === "pendentes" && it.decisao) return false;
    if (filtro === "manter" && it.decisao !== "manter") return false;
    if (filtro === "revogar" && it.decisao !== "revogar") return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return [it.colaborador_nome, it.perfil_nome, it.recurso_nome, it.cargo_nome, it.area_nome].some((v) => (v || "").toLowerCase().includes(s));
  }).sort((a, b) => (a.colaborador_nome || "").localeCompare(b.colaborador_nome || "")), [itens, filtro, search]);

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!revisao) return <div className="p-8"><EmptyState message="Revisão não encontrada." size="lg" /></div>;

  const all = (itens || []) as Row[];
  const mantidos = all.filter((it) => it.decisao === "manter").length;
  const revogados = all.filter((it) => it.decisao === "revogar").length;
  const pendentes = all.filter((it) => !it.decisao).length;
  const progress = all.length > 0 ? ((mantidos + revogados) / all.length) * 100 : 0;
  const externalUrl = (revisao as Row).token ? `${window.location.origin}/revisao-externa/${(revisao as Row).token}` : null;
  const late = isAtiva && revisao.data_fim && revisao.data_fim < new Date().toISOString().slice(0, 10);
  const st = late ? { label: "Atrasada", className: "bg-destructive/15 text-destructive border-destructive/30" } : STATUS[revisao.status] || { label: revisao.status, className: "" };

  const decidir = async (ids: string[], decisao: "manter" | "revogar") => {
    if (!isAtiva || !canEdit || ids.length === 0) return;
    setBusy("decidir");
    const decisoes = Object.fromEntries(ids.map((i) => [i, decisao]));
    const justificativas = Object.fromEntries(ids.filter((i) => justif[i]).map((i) => [i, justif[i]]));
    const { data, error } = await supabase.rpc("revisao_decidir_itens", { p_revisao_id: id!, p_decisoes: decisoes, p_justificativas: justificativas, p_decidido_por: profile?.email || null });
    setBusy(null);
    const r = (data ?? {}) as Row;
    if (error || r.ok === false) { toast({ title: "Não foi possível registrar", description: error?.message || r.error, variant: "destructive" }); return; }
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["revisao_itens", id] });
  };

  // vocabulário por tipo: revisão de acessos (revogar) × revalidação de terceiros (desligar)
  const isTerc = revisao?.tipo === "terceiros";
  const REVOGAR = isTerc ? "Desligar" : "Revogar";

  const concluir = async () => {
    setBusy("concluir");
    const { data, error } = await supabase.rpc("revisao_concluir", { p_revisao_id: id!, p_decidido_por: profile?.email || null });
    setBusy(null); setConfirm(null);
    const r = (data ?? {}) as Row;
    if (error || r.ok === false) { toast({ title: "Não foi possível concluir", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: isTerc ? "Revalidação concluída" : "Revisão concluída", description: `${r.mantidos} mantidos · ${r.revogados} ${isTerc ? "desligados" : "revogados"} · ${r.acoes} ação(ões) já aprovada(s) para o agente${r.pendentes ? ` · ${r.pendentes} sem decisão (mantidos)` : ""}` });
    if (r.owner_email) sendNotificationEmail("revisao_concluida", { destinatario_email: r.owner_email, revisao_nome: r.nome, revisao_id: id, total_itens: all.length, mantidos: r.mantidos, revogados: r.revogados });
  };

  const cancelar = async () => {
    setBusy("cancelar");
    const { data, error } = await supabase.rpc("revisao_cancelar", { p_revisao_id: id!, p_motivo: "Cancelada na ferramenta" });
    setBusy(null); setConfirm(null);
    const r = (data ?? {}) as Row;
    if (error || r.ok === false) { toast({ title: "Erro", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: "Campanha cancelada" });
  };

  const reenviar = async () => {
    setBusy("resend");
    const { error } = await invokeFunction("send-review-email", { revisao_id: id });
    setBusy(null);
    if (error) toast({ title: "Falha ao enviar", description: error, variant: "destructive" });
    else toast({ title: "E-mail enviado", description: `Link de revisão enviado para ${revisao.owner_email || revisao.responsavel}` });
  };

  const toggleAll = () => setSelected(selected.size === lista.length ? new Set() : new Set(lista.map((it) => it.id)));

  return (
    <div className="space-y-5">
      <PageHeader
        leading={<Button variant="ghost" size="icon" asChild><Link to="/revisoes"><ArrowLeft className="h-4 w-4" /></Link></Button>}
        title={revisao.nome}
        description={<>
          {isTerc ? "Revalidação de terceiros" : revisao.tipo === "gestor" ? "Revisão por gestor" : "Revisão por aplicação"} · responsável <span className="font-medium">{revisao.owner_email || revisao.responsavel || "—"}</span>
          {" · "}{revisao.data_inicio ? new Date(revisao.data_inicio + "T12:00:00").toLocaleDateString("pt-BR") : ""} → {revisao.data_fim ? new Date(revisao.data_fim + "T12:00:00").toLocaleDateString("pt-BR") : "sem prazo"}
          {(revisao as Row).concluida_por ? <> · encerrada por {(revisao as Row).concluida_por}</> : null}
        </>}
        actions={<>
          <Badge variant="outline" className={st.className}>{st.label}</Badge>
          {externalUrl && isAtiva && (
            <>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(externalUrl); toast({ title: "Link copiado" }); }}><Copy className="mr-1 h-3.5 w-3.5" />Copiar link</Button>
              <Button variant="outline" size="sm" asChild><a href={externalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Abrir como revisor</a></Button>
            </>
          )}
        </>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Acessos na campanha" value={all.length} />
        <StatCard label="Manter" value={mantidos} icon={CheckCircle2} tone="success" active={filtro === "manter"} onClick={() => setFiltro(filtro === "manter" ? "todos" : "manter")} />
        <StatCard label={REVOGAR} value={revogados} icon={XCircle} tone="destructive" active={filtro === "revogar"} onClick={() => setFiltro(filtro === "revogar" ? "todos" : "revogar")} />
        <StatCard label="Sem decisão" value={pendentes} tone={pendentes ? "warning" : "success"} active={filtro === "pendentes"} onClick={() => setFiltro(filtro === "pendentes" ? "todos" : "pendentes")} />
      </div>

      <Card><CardContent className="pt-5">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Progresso: {mantidos + revogados} de {all.length}</span><span className="text-muted-foreground">{Math.round(progress)}%</span></div>
        <Progress value={progress} className="h-2.5" />
        {isAtiva && (isTerc
          ? <p className="mt-2 text-xs text-muted-foreground">Ao concluir, os terceiros marcados como <strong>desligar</strong> são desativados: contas desabilitadas e acessos removidos pelo Órigo Agente, já aprovados. Os marcados como <strong>manter</strong> ficam revalidados. Sem resposta do responsável até {revisao.data_fim ? new Date(revisao.data_fim + "T12:00:00").toLocaleDateString("pt-BR") : "o prazo"}, o sistema conclui sozinho <strong>desligando</strong> quem ficou sem decisão.</p>
          : <p className="mt-2 text-xs text-muted-foreground">Ao concluir, os itens marcados como <strong>revogar</strong> perdem o acesso: as remoções entram na fila já aprovadas (a decisão do responsável é a aprovação) e o Órigo Agente executa. Itens sem decisão são mantidos.</p>)}
      </CardContent></Card>

      {canEdit && isAtiva && (
        <Card className="border-primary/20"><CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Button variant="outline" size="sm" onClick={reenviar} disabled={busy !== null || !revisao.owner_email}>{busy === "resend" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}Reenviar e-mail</Button>
          <Button size="sm" onClick={() => setConfirm("concluir")} disabled={busy !== null || all.length === 0}><Bot className="mr-1 h-3 w-3" />Concluir e executar</Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm("cancelar")} disabled={busy !== null}><XCircle className="mr-1 h-3 w-3" />Cancelar campanha</Button>
          {!revisao.owner_email && <span className="text-xs text-warning">Responsável sem e-mail — use "Copiar link" para enviar manualmente.</span>}
        </CardContent></Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pessoa, perfil, cargo ou área…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="pendentes">Sem decisão</SelectItem><SelectItem value="manter">Manter</SelectItem><SelectItem value="revogar">{REVOGAR}</SelectItem></SelectContent>
        </Select>
        {canEdit && isAtiva && (
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>}
            <Button variant="outline" size="sm" className="text-success border-success/30 hover:bg-success/10" disabled={busy !== null || (selected.size === 0 && lista.length === 0)} onClick={() => decidir(selected.size ? [...selected] : lista.map((it) => it.id), "manter")}><Check className="mr-1 h-3 w-3" />Manter {selected.size ? `(${selected.size})` : "todos visíveis"}</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={busy !== null || (selected.size === 0 && lista.length === 0)} onClick={() => decidir(selected.size ? [...selected] : lista.map((it) => it.id), "revogar")}><X className="mr-1 h-3 w-3" />{REVOGAR} {selected.size ? `(${selected.size})` : "todos visíveis"}</Button>
          </div>
        )}
      </div>

      <Card><CardContent className="p-0">
        {lista.length === 0 ? <div className="py-10"><EmptyState message="Nenhum item com esses filtros." /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            {canEdit && isAtiva && <th className="w-8 p-3"><Checkbox checked={selected.size === lista.length && lista.length > 0} onCheckedChange={toggleAll} /></th>}
            <th className="p-3 font-medium">Pessoa</th><th className="p-3 font-medium">Acesso</th><th className="p-3 font-medium hidden md:table-cell">Origem</th>
            <th className="p-3 font-medium">Decisão</th><th className="p-3 font-medium hidden lg:table-cell">Quem / quando</th>
          </tr></thead><tbody>
            {lista.map((it: Row) => {
              const link = it.colaborador_id ? `/colaboradores/${it.colaborador_id}` : it.terceiro_id ? `/terceiros/${it.terceiro_id}` : null;
              return (
                <tr key={it.id} className={`border-b last:border-0 ${it.decisao === "revogar" ? "bg-destructive/5" : it.decisao === "manter" ? "bg-success/5" : ""}`}>
                  {canEdit && isAtiva && <td className="p-3"><Checkbox checked={selected.has(it.id)} onCheckedChange={() => setSelected((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} /></td>}
                  <td className="p-3">{link ? <Link to={link} className="font-medium text-primary hover:underline">{it.colaborador_nome}</Link> : <span className="font-medium">{it.colaborador_nome}</span>}{it.terceiro_id && <Badge variant="outline" className="ml-1 text-[10px]">Terceiro</Badge>}<div className="text-[11px] text-muted-foreground">{[it.cargo_nome, it.area_nome].filter(Boolean).join(" · ")}</div></td>
                  <td className="p-3"><div className="font-medium">{it.recurso_nome || it.perfil_nome || "—"}</div><div className="text-[11px] text-muted-foreground">{it.tipo === "terceiro" ? "Acesso de terceiro" : it.tipo === "individual" ? "Acesso direto (fora de perfil)" : "Perfil de acesso"}</div></td>
                  <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">{{ cargo: "Cargo", manual: "Manual", excecao: "Exceção", reativacao: "Reativação", manual_individual: "Manual (direto)", entra_sync: "Existia no Entra", terceiro: "Responsável" }[String(it.origem)] || humanize(it.origem) || "—"}</td>
                  <td className="p-3">
                    {canEdit && isAtiva ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1">
                          <Button size="sm" variant={it.decisao === "manter" ? "default" : "outline"} className={`h-7 ${it.decisao === "manter" ? "bg-success text-white hover:bg-success/90" : "text-success border-success/30 hover:bg-success/10"}`} disabled={busy !== null} onClick={() => decidir([it.id], "manter")}><Check className="mr-1 h-3 w-3" />Manter</Button>
                          <Button size="sm" variant={it.decisao === "revogar" ? "default" : "outline"} className={`h-7 ${it.decisao === "revogar" ? "bg-destructive text-white hover:bg-destructive/90" : "text-destructive border-destructive/30 hover:bg-destructive/10"}`} disabled={busy !== null} onClick={() => decidir([it.id], "revogar")}><X className="mr-1 h-3 w-3" />{REVOGAR}</Button>
                        </div>
                        {it.decisao === "revogar" && <Input className="h-7 text-xs" placeholder="Justificativa (opcional)" defaultValue={it.justificativa || ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (it.justificativa || "")) { setJustif((j) => ({ ...j, [it.id]: v })); supabase.rpc("revisao_decidir_itens", { p_revisao_id: id!, p_decisoes: { [it.id]: "revogar" }, p_justificativas: { [it.id]: v }, p_decidido_por: profile?.email || null }); } }} />}
                      </div>
                    ) : it.decisao ? (
                      <div><Badge variant="outline" className={it.decisao === "manter" ? "bg-success/15 text-success border-success/30" : "bg-destructive/15 text-destructive border-destructive/30"}>{it.decisao === "manter" ? "Manter" : REVOGAR}</Badge>{it.justificativa && <div className="mt-0.5 text-[11px] text-muted-foreground">“{it.justificativa}”</div>}</div>
                    ) : <Badge variant="outline" className="bg-muted text-muted-foreground">Sem decisão</Badge>}
                  </td>
                  <td className="p-3 hidden lg:table-cell text-xs text-muted-foreground">{it.decidido_em ? <>{it.decidido_por || "—"}<br />{new Date(it.decidido_em).toLocaleString("pt-BR")}</> : "—"}{it.executado_em && <div className="text-[10px] text-success">Enviado ao agente</div>}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </CardContent></Card>

      {revisao.status === "concluida" && (
        <Card>
          <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-primary" />Execução pelo agente</CardTitle><Link to={`/fila-provisionamento?tab=fila&status=todos&origem=${encodeURIComponent(`revisao:${id}`)}`} className="text-xs text-primary hover:underline">Ver na fila</Link></div></CardHeader>
          <CardContent className="p-0">
            {(execucao ?? []).length === 0 ? <div className="py-6"><EmptyState message={isTerc ? "Nenhuma ação foi necessária (todos mantidos)." : "Nenhuma remoção foi necessária (acessos mantidos ou ainda concedidos por outro perfil)."} /></div> : (
              <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="p-3 font-medium">Ação</th><th className="p-3 font-medium">Conta</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Resultado</th></tr></thead><tbody>
                {(execucao ?? []).map((q: Row) => (
                  <tr key={q.id} className="border-b last:border-0"><td className="p-3"><Link to={`/fila-provisionamento/${q.id}`} className="hover:underline">{actionLabel(q.action_type)}</Link><div className="text-[11px] text-muted-foreground">{q.payload_json?.groupName || q.payload_json?.licenseName || q.payload_json?.appName || q.payload_json?.siteName || ""}</div></td><td className="p-3 font-mono text-xs">{q.target_identity}</td><td className="p-3"><Badge variant="outline" className={QUEUE_STATUS_META[q.status]?.className}>{statusLabel(q.status)}</Badge></td><td className="max-w-xs truncate p-3 text-xs text-muted-foreground">{q.error_code ? `[${q.error_code}] ` : ""}{q.result_message || (q.processed_at ? new Date(q.processed_at).toLocaleString("pt-BR") : "aguardando o agente")}</td></tr>
                ))}
              </tbody></table>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirm === "concluir"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir e executar?</AlertDialogTitle>
            <AlertDialogDescription>{isTerc
              ? <><strong>{revogados}</strong> terceiro(s) serão desligados (contas desabilitadas e acessos removidos pelo Órigo Agente, sem outra aprovação); <strong>{mantidos}</strong> revalidados{pendentes ? `; ${pendentes} sem decisão serão mantidos` : ""}. Esta ação encerra a campanha.</>
              : <><strong>{revogados}</strong> acesso(s) serão revogados pelo Órigo Agente sem outra aprovação; <strong>{mantidos}</strong> mantidos{pendentes ? `; ${pendentes} sem decisão serão mantidos` : ""}. Esta ação encerra a campanha.</>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={concluir}><CheckSquare className="mr-1 h-4 w-4" />Concluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirm === "cancelar"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Cancelar campanha?</AlertDialogTitle><AlertDialogDescription>Nenhuma decisão será executada. As decisões já registradas ficam apenas como histórico.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction onClick={cancelar} className="bg-destructive hover:bg-destructive/90">Cancelar campanha</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
