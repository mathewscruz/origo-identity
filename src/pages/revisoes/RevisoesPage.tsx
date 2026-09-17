import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppWindow, CalendarClock, CheckCircle2, ClipboardCheck, Hourglass, Loader2, Plus, Search, Users, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TablePagination, { usePagination } from "@/components/TablePagination";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import OnboardingTour from "@/components/OnboardingTour";
import { tourSteps } from "@/lib/tourSteps";
import { useAplicacoes, useColaboradores, useRevisoes, useTerceiros, useParametro } from "@/hooks/useOrigoData";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCanEdit } from "@/hooks/useRole";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const STATUS: Record<string, { label: string; className: string }> = {
  em_andamento: { label: "Em andamento", className: "bg-info/15 text-info border-info/30" },
  concluida: { label: "Concluída", className: "bg-success/15 text-success border-success/30" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};
const TIPO: Record<string, { label: string; icon: typeof AppWindow }> = {
  aplicacao: { label: "Por aplicação (owner)", icon: AppWindow },
  gestor: { label: "Por gestor (equipe)", icon: Users },
  terceiros: { label: "Revalidação de terceiros", icon: UserCheck },
};

export default function RevisoesPage() {
  const { data: revisoes, isLoading } = useRevisoes();
  const { data: aplicacoes } = useAplicacoes();
  const { data: colaboradores } = useColaboradores();
  const { data: terceiros } = useTerceiros();
  const prazoTerceiros = useParametro("terceiro_revalidacao_prazo_dias", "7");
  const { toast } = useToast();
  const { profile } = useAuth();
  const canEdit = useCanEdit();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // ?new=1 (paleta de comandos) abre o diálogo de nova campanha
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setDialogOpen(true);
    const next = new URLSearchParams(searchParams); next.delete("new"); setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [tipo, setTipo] = useState<"aplicacao" | "gestor" | "todos_gestores" | "terceiros" | "todos_responsaveis">("aplicacao");
  const [selectedApp, setSelectedApp] = useState("");
  const [selectedGestor, setSelectedGestor] = useState("");
  const [selectedResp, setSelectedResp] = useState("");
  const [dataLimite, setDataLimite] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");

  const list = (revisoes ?? []) as Row[];
  const hoje = new Date().toISOString().slice(0, 10);
  const isAtrasada = (r: Row) => r.status === "em_andamento" && r.data_fim && r.data_fim < hoje;
  const gestores = useMemo(() => {
    const ids = new Set(((colaboradores ?? []) as Row[]).map((c) => c.gestor_id).filter(Boolean));
    return ((colaboradores ?? []) as Row[]).filter((c) => ids.has(c.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores]);
  // responsáveis por terceiros ativos (colaborador vinculado)
  const responsaveis = useMemo(() => {
    const count = new Map<string, number>();
    ((terceiros ?? []) as Row[]).forEach((t) => { if (t.ativo && t.responsavel_colaborador_id) count.set(t.responsavel_colaborador_id, (count.get(t.responsavel_colaborador_id) ?? 0) + 1); });
    return ((colaboradores ?? []) as Row[]).filter((c) => count.has(c.id)).map((c) => ({ ...c, terceiros: count.get(c.id) ?? 0 })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores, terceiros]);
  const terceirosSemResponsavel = useMemo(() => ((terceiros ?? []) as Row[]).filter((t) => t.ativo && !t.responsavel_colaborador_id).length, [terceiros]);

  const filtered = list.filter((r) => {
    if (statusFilter === "atrasadas" ? !isAtrasada(r) : statusFilter !== "todas" && r.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.nome || "").toLowerCase().includes(s) || (r.responsavel || "").toLowerCase().includes(s) || (r.owner_email || "").toLowerCase().includes(s);
  });
  const { paginatedItems, safePage } = usePagination(filtered, page, pageSize);
  const abertas = list.filter((r) => r.status === "em_andamento");
  const atrasadas = abertas.filter(isAtrasada);
  const itensPendentes = abertas.reduce((s, r) => s + Math.max(0, (r.total_itens || 0) - (r.itens_revisados || 0)), 0);
  const concluidas90 = list.filter((r) => r.status === "concluida" && new Date(r.updated_at || r.created_at).getTime() > Date.now() - 90 * 86400000).length;

  // devolve null no sucesso ou a mensagem de erro real da função
  const sendEmail = async (id: string): Promise<string | null> => (await invokeFunction("send-review-email", { revisao_id: id })).error;

  const handleCreate = async () => {
    setCreating(true);
    try {
      if (tipo === "todos_responsaveis") {
        const { data, error } = await supabase.rpc("revisao_criar_por_responsaveis", { p_data_fim: dataLimite || null, p_operador: profile?.email || null, p_somente_vencidos: false });
        if (error) throw error;
        const r = (data ?? {}) as Row;
        let enviados = 0;
        let ultimoErro: string | null = null;
        for (const id of (r.ids || []) as string[]) { const e = await sendEmail(id); if (e) ultimoErro = e; else enviados++; }
        const semResp = ((r.sem_responsavel || []) as string[]).length;
        toast({ title: `${r.criadas ?? 0} revalidação(ões) criada(s)`, description: `${r.existentes ?? 0} já existiam · ${enviados} e-mail(s) enviado(s)${semResp ? ` · ${semResp} terceiro(s) sem responsável com e-mail` : ""}${ultimoErro ? ` · falha no envio: ${ultimoErro}` : ""}`, variant: ultimoErro ? "destructive" : undefined });
      } else if (tipo === "todos_gestores") {
        const { data, error } = await supabase.rpc("revisao_criar_por_gestores", { p_data_fim: dataLimite || null, p_operador: profile?.email || null });
        if (error) throw error;
        const r = (data ?? {}) as Row;
        let enviados = 0;
        let ultimoErro: string | null = null;
        for (const id of (r.ids || []) as string[]) { const e = await sendEmail(id); if (e) ultimoErro = e; else enviados++; }
        toast({ title: `${r.criadas ?? 0} campanha(s) criada(s) por gestor`, description: `${r.existentes ?? 0} já existiam · ${enviados} e-mail(s) enviado(s)${r.sem_email ? ` · ${r.sem_email} gestor(es) sem e-mail` : ""}${ultimoErro ? ` · falha no envio: ${ultimoErro}` : ""}`, variant: ultimoErro ? "destructive" : undefined });
      } else {
        if (tipo === "aplicacao" && !selectedApp) return;
        if (tipo === "gestor" && !selectedGestor) return;
        if (tipo === "terceiros" && !selectedResp) return;
        const { data, error } = await supabase.rpc("revisao_criar", {
          p_tipo: tipo, p_aplicacao_id: tipo === "aplicacao" ? selectedApp : null, p_gestor_id: tipo === "gestor" ? selectedGestor : tipo === "terceiros" ? selectedResp : null,
          p_data_fim: tipo === "terceiros" ? null : (dataLimite || null), p_nome: null, p_operador: profile?.email || null, p_responsavel: null,
        });
        if (error) throw error;
        const r = (data ?? {}) as Row;
        if (r.ok === false) throw new Error(r.error);
        if (r.existente) { toast({ title: "Já existe uma campanha em andamento", description: "Abrindo a campanha existente." }); }
        else {
          const emailErr = r.owner_email ? await sendEmail(r.id) : null;
          toast({ title: tipo === "terceiros" ? "Revalidação criada" : "Campanha criada", description: `${r.total_itens ?? 0} ${tipo === "terceiros" ? "terceiro(s) para revalidar" : "acesso(s) para revisar"}${r.owner_email ? (emailErr ? ` · falha ao enviar e-mail para ${r.owner_email}: ${emailErr}` : ` · e-mail enviado para ${r.owner_email}`) : " · responsável sem e-mail: envie o link externo manualmente"}`, variant: emailErr ? "destructive" : undefined });
        }
      }
      setDialogOpen(false); setSelectedApp(""); setSelectedGestor(""); setSelectedResp("");
    } catch (err) {
      toast({ title: "Não foi possível criar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revisões de Acesso"
        icon={ClipboardCheck}
        description="Recertificação: o owner da aplicação ou o gestor da equipe decide quem mantém e quem perde cada acesso; o responsável por terceiros revalida ou desliga cada um. Tudo o que for decidido entra na fila já aprovado e o Órigo Agente executa."
        actions={canEdit && <div data-tour="actions"><Button onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-4 w-4" />Nova campanha</Button></div>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Em andamento" value={abertas.length} icon={Hourglass} tone="info" active={statusFilter === "em_andamento"} onClick={() => { setStatusFilter(statusFilter === "em_andamento" ? "todas" : "em_andamento"); setPage(1); }} hint={`${itensPendentes} acesso(s) sem decisão`} />
        <StatCard label="Atrasadas" value={atrasadas.length} icon={CalendarClock} tone={atrasadas.length ? "destructive" : "success"} active={statusFilter === "atrasadas"} onClick={() => { setStatusFilter(statusFilter === "atrasadas" ? "todas" : "atrasadas"); setPage(1); }} hint="prazo vencido com itens pendentes" />
        <StatCard label="Concluídas (90 dias)" value={concluidas90} icon={CheckCircle2} tone="success" active={statusFilter === "concluida"} onClick={() => { setStatusFilter(statusFilter === "concluida" ? "todas" : "concluida"); setPage(1); }} />
        <StatCard label="Campanhas" value={list.length} icon={ClipboardCheck} tone="primary" active={statusFilter === "todas"} onClick={() => { setStatusFilter("todas"); setPage(1); }} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Nome, responsável ou e-mail…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Todas</SelectItem><SelectItem value="em_andamento">Em andamento</SelectItem><SelectItem value="atrasadas">Atrasadas</SelectItem><SelectItem value="concluida">Concluídas</SelectItem><SelectItem value="cancelada">Canceladas</SelectItem></SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} campanha(s)</span>
      </div>

      <Card data-tour="table"><CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : paginatedItems.length === 0 ? (
          <div className="py-10"><EmptyState message="Nenhuma campanha com esses filtros." /></div>
        ) : (
          <table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="p-3 font-medium">Campanha</th><th className="p-3 font-medium hidden md:table-cell">Tipo</th><th className="p-3 font-medium">Status</th>
            <th className="p-3 font-medium">Progresso</th><th className="p-3 font-medium hidden lg:table-cell">Responsável</th>
            <th className="p-3 font-medium">Prazo</th><th className="p-3 font-medium hidden xl:table-cell">Resultado</th>
          </tr></thead><tbody>
            {paginatedItems.map((r: Row) => {
              const t = TIPO[r.tipo] || TIPO.aplicacao; const late = isAtrasada(r);
              const pct = r.total_itens > 0 ? Math.round((r.itens_revisados / r.total_itens) * 100) : 0;
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-3"><Link to={`/revisoes/${r.id}`} className="font-medium text-primary hover:underline">{r.nome}</Link><div className="text-[11px] text-muted-foreground">criada {new Date(r.created_at).toLocaleDateString("pt-BR")}{r.criada_por ? ` por ${r.criada_por}` : ""}</div></td>
                  <td className="p-3 hidden md:table-cell"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><t.icon className="h-3.5 w-3.5" />{t.label}</span></td>
                  <td className="p-3"><Badge variant="outline" className={late ? "bg-destructive/15 text-destructive border-destructive/30" : STATUS[r.status]?.className}>{late ? "Atrasada" : STATUS[r.status]?.label || r.status}</Badge></td>
                  <td className="p-3 min-w-[150px]"><div className="flex items-center gap-2"><Progress value={pct} className="h-2 flex-1" /><span className="text-xs tabular-nums text-muted-foreground">{r.itens_revisados}/{r.total_itens}</span></div></td>
                  <td className="p-3 hidden lg:table-cell text-xs text-muted-foreground">{r.owner_email || r.responsavel || "—"}</td>
                  <td className="p-3 text-xs">{r.data_fim ? <span className={late ? "font-medium text-destructive" : ""}>{new Date(r.data_fim + "T12:00:00").toLocaleDateString("pt-BR")}</span> : <span className="text-muted-foreground">sem prazo</span>}</td>
                  <td className="p-3 hidden xl:table-cell text-xs text-muted-foreground">{r.resultado?.cancelada ? "Cancelada" : r.resultado ? `${r.resultado.mantidos ?? 0} mantidos · ${r.resultado.revogados ?? 0} ${r.tipo === "terceiros" ? "desligados" : "revogados"}${r.resultado.automaticos ? ` (${r.resultado.automaticos} por prazo)` : ""}` : "—"}</td>
                </tr>
              );
            })}
          </tbody></table>
        )}
      </CardContent></Card>
      <TablePagination totalItems={filtered.length} pageSize={pageSize} currentPage={safePage} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
            <DialogDescription>O responsável recebe um link por e-mail (sem login) e decide item a item. Ao concluir, revogações e desligamentos vão para o agente já aprovados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([["aplicacao", "Aplicação", "owner revisa quem tem o app"], ["gestor", "Gestor", "gestor revisa a equipe"], ["todos_gestores", "Todos os gestores", "uma campanha por equipe"], ["terceiros", "Terceiros", "responsável revalida ou desliga"], ["todos_responsaveis", "Todos os responsáveis", "uma revalidação por responsável"]] as const).map(([v, l, d]) => (
                <button key={v} type="button" onClick={() => setTipo(v)} className={`rounded-lg border p-3 text-left transition-colors ${tipo === v ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/50"}`}>
                  <div className="text-sm font-medium">{l}</div><div className="text-[11px] text-muted-foreground">{d}</div>
                </button>
              ))}
            </div>
            {tipo === "aplicacao" && (
              <div className="space-y-2">
                <Label>Aplicação</Label>
                <Select value={selectedApp} onValueChange={setSelectedApp}>
                  <SelectTrigger><SelectValue placeholder="Selecione a aplicação" /></SelectTrigger>
                  <SelectContent>{((aplicacoes || []) as Row[]).map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}{a.owner ? ` — ${a.owner}` : " — sem owner"}</SelectItem>)}</SelectContent>
                </Select>
                {selectedApp && !((aplicacoes || []) as Row[]).find((a) => a.id === selectedApp)?.owner && <p className="text-xs text-warning">Esta aplicação não tem owner: a campanha nasce sem responsável e o link precisa ser enviado manualmente.</p>}
              </div>
            )}
            {tipo === "gestor" && (
              <div className="space-y-2">
                <Label>Gestor</Label>
                <Select value={selectedGestor} onValueChange={setSelectedGestor}>
                  <SelectTrigger><SelectValue placeholder="Selecione o gestor" /></SelectTrigger>
                  <SelectContent>{gestores.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}{g.email ? ` — ${g.email}` : ""}</SelectItem>)}</SelectContent>
                </Select>
                {gestores.length === 0 && <p className="text-xs text-muted-foreground">Nenhum colaborador tem gestor definido (campo "Gestor direto").</p>}
              </div>
            )}
            {tipo === "todos_gestores" && <p className="text-sm text-muted-foreground">{gestores.length} gestor(es) com equipe. Uma campanha por gestor, com todos os perfis e acessos diretos da equipe; gestores que já têm campanha aberta são pulados.</p>}
            {tipo === "terceiros" && (
              <div className="space-y-2">
                <Label>Responsável pelos terceiros</Label>
                <Select value={selectedResp} onValueChange={setSelectedResp}>
                  <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                  <SelectContent>{responsaveis.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome} — {g.terceiros} terceiro(s){g.email ? ` · ${g.email}` : " · sem e-mail"}</SelectItem>)}</SelectContent>
                </Select>
                {responsaveis.length === 0 && <p className="text-xs text-muted-foreground">Nenhum terceiro ativo tem responsável (colaborador) definido.</p>}
              </div>
            )}
            {tipo === "todos_responsaveis" && <p className="text-sm text-muted-foreground">{responsaveis.length} responsável(is) com terceiros ativos. Uma revalidação por responsável (todos os seus terceiros, vencidos ou não); quem já tem revalidação aberta é pulado.{terceirosSemResponsavel > 0 && <span className="text-warning"> {terceirosSemResponsavel} terceiro(s) sem responsável ficam de fora.</span>}</p>}
            {tipo === "terceiros" || tipo === "todos_responsaveis" ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">Prazo: <strong>{prazoTerceiros} dias</strong> (parâmetro "Prazo para revalidar terceiros"). Sem resposta do responsável até o prazo, os terceiros da campanha são <strong>desativados automaticamente</strong>.</p>
            ) : (
              <div className="space-y-2">
                <Label>Prazo</Label>
                <Input type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} />
                <p className="text-xs text-muted-foreground">Lembrete automático 3 dias antes; alerta crítico se vencer com itens pendentes.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating || (tipo === "aplicacao" && !selectedApp) || (tipo === "gestor" && !selectedGestor) || (tipo === "terceiros" && !selectedResp)}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OnboardingTour pageKey="revisoes" steps={tourSteps.revisoes} />
    </div>
  );
}
