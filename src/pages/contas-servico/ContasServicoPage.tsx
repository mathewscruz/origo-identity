import { useColumnVisibility } from "@/components/ColumnToggle";
import { useDeferredValue } from "react";
import { IdentityAvatar } from "@/components/identity/IdentityCells";
import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, UserX, CalendarClock, AlertTriangle, Plus, Search, Pencil, Power, RefreshCcw, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { AutoUpdatedHint } from "@/components/AutoUpdatedHint";
import ColaboradorPicker from "@/components/ColaboradorPicker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCanEdit } from "@/hooks/useRole";
import { useParametro } from "@/hooks/useOrigoData";
import { revalidacaoVencida, semDono, diasDesdeRevalidacao } from "@/lib/contasServico";

type Conta = {
  id: string; nome: string; email: string | null; sam_account_name: string | null; finalidade: string | null; sistemas: string | null;
  criticidade: string; dono_colaborador_id: string | null; ultima_revalidacao: string | null; ativo: boolean; entra_ativo: boolean | null;
  ultimo_login: string | null; verificado_em: string | null; verificacao_detalhe: string | null; created_at: string;
};

const CRIT: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta", critica: "Crítica" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const vazio = { nome: "", email: "", sam_account_name: "", finalidade: "", sistemas: "", criticidade: "media", dono_colaborador_id: "" };

export default function ContasServicoPage() {
  const cols = useColumnVisibility("contas", [
    { key: "dono", label: "Dono", index: 2 }, { key: "reval", label: "Revalidação", index: 3 }, { key: "entra", label: "Entra", index: 4 },
  ]);
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();
  const canEdit = useCanEdit();
  const dias = Number(useParametro("conta_servico_revalidacao_dias", "90")) || 90;
  const [busca, setBusca] = useState("");
  const buscaDeferida = useDeferredValue(busca);
  const [filtro, setFiltro] = useState<"todas" | "ativas" | "inativas" | "sem_dono" | "vencidas">("todas");
  const [form, setForm] = useState<typeof vazio | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [desativar, setDesativar] = useState<Conta | null>(null);
  const [motivo, setMotivo] = useState("");

  const { data: contas, isLoading } = useQuery({
    queryKey: ["contas_servico"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas_servico").select("*").order("nome");
      if (error) throw error;
      return data as Conta[];
    },
    refetchInterval: 30000,
  });
  const donoIds = useMemo(() => [...new Set((contas ?? []).map((c) => c.dono_colaborador_id).filter(Boolean))] as string[], [contas]);
  const { data: donos } = useQuery({
    queryKey: ["contas_servico_donos", donoIds.join(",")],
    enabled: donoIds.length > 0,
    queryFn: async () => (await supabase.from("colaboradores").select("id, nome, email").in("id", donoIds)).data ?? [],
  });
  const donoNome = (cid: string | null) => (cid ? donos?.find((d) => d.id === cid)?.nome ?? "…" : null);

  const list = contas ?? [];
  const filtered = list.filter((c) => {
    if (buscaDeferida && !`${c.nome} ${c.email ?? ""} ${c.sam_account_name ?? ""}`.toLowerCase().includes(buscaDeferida.toLowerCase())) return false;
    if (filtro === "ativas") return c.ativo;
    if (filtro === "inativas") return !c.ativo;
    if (filtro === "sem_dono") return semDono(c);
    if (filtro === "vencidas") return revalidacaoVencida(c, dias);
    return true;
  });
  const aberto = id ? list.find((c) => c.id === id) : null;

  useEffect(() => { if (id && contas && !aberto) navigate("/contas-servico", { replace: true }); }, [id, contas, aberto, navigate]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["contas_servico"] });
  const openNew = () => { setEditId(null); setForm({ ...vazio }); };
  const openEdit = (c: Conta) => { setEditId(c.id); setForm({ nome: c.nome, email: c.email ?? "", sam_account_name: c.sam_account_name ?? "", finalidade: c.finalidade ?? "", sistemas: c.sistemas ?? "", criticidade: c.criticidade, dono_colaborador_id: c.dono_colaborador_id ?? "" }); };

  const salvar = async () => {
    if (!form) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("conta_servico_salvar", { p_id: editId, p_dados: form, p_operador: profile?.email ?? null });
    setSaving(false);
    const r = (data ?? {}) as Record<string, any>;
    if (error || r.ok === false) { toast({ title: "Não foi possível salvar", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: editId ? "Conta atualizada" : "Conta cadastrada", description: r.conta_enfileirada ? "Criação da conta enviada ao Hermes" : undefined });
    setForm(null); refresh();
  };

  const alterarStatus = async (c: Conta, ativo: boolean) => {
    const { data, error } = await supabase.rpc("conta_servico_alterar_status", { p_id: c.id, p_ativo: ativo, p_operador: profile?.email ?? null, p_motivo: ativo ? "Reativada no painel" : motivo });
    const r = (data ?? {}) as Record<string, any>;
    if (error || r.ok === false) { toast({ title: "Não foi possível alterar", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: ativo ? "Reativação enviada ao Hermes" : "Desativação enviada ao Hermes", description: ativo ? "Aguarda aprovação na Fila" : undefined });
    setDesativar(null); setMotivo(""); refresh();
  };

  const revalidar = async (c: Conta) => {
    const { data, error } = await supabase.rpc("conta_servico_revalidar", { p_id: c.id, p_operador: profile?.email ?? null });
    const r = (data ?? {}) as Record<string, any>;
    if (error || r.ok === false) { toast({ title: "Erro", description: error?.message || r.error, variant: "destructive" }); return; }
    toast({ title: "Conta revalidada" }); refresh();
  };

  const entraBadge = (c: Conta) => {
    if (c.entra_ativo === null) return <span className="text-xs text-muted-foreground">{c.verificado_em ? "Não encontrada" : "Aguardando Hermes"}</span>;
    const div = c.entra_ativo !== c.ativo;
    return <Badge variant="outline" className={div ? "border-warning/40 text-warning" : "text-muted-foreground"}>{c.entra_ativo ? "Ativa" : "Desabilitada"}{div ? " · divergente" : ""}</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas de serviço"
        description={<>Contas usadas por sistemas e integrações. Cada uma tem um dono que revalida a cada {dias} dias; não seguem entrada/saída do RH. <AutoUpdatedHint tasks="sync-service-accounts" /></>}
        actions={canEdit ? <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />Nova conta</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ativas" value={list.filter((c) => c.ativo).length} icon={Bot} tone="success" onClick={() => setFiltro(filtro === "ativas" ? "todas" : "ativas")} />
        <StatCard label="Sem dono" value={list.filter(semDono).length} icon={UserX} tone="destructive" onClick={() => setFiltro(filtro === "sem_dono" ? "todas" : "sem_dono")} />
        <StatCard label="Revalidação vencida" value={list.filter((c) => revalidacaoVencida(c, dias)).length} icon={CalendarClock} tone="warning" onClick={() => setFiltro(filtro === "vencidas" ? "todas" : "vencidas")} />
        <StatCard label="Divergentes no Entra" value={list.filter((c) => c.entra_ativo !== null && c.entra_ativo !== c.ativo).length} icon={AlertTriangle} tone="info" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar contas..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {cols.menu}
        <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem><SelectItem value="ativas">Ativas</SelectItem><SelectItem value="inativas">Desativadas</SelectItem>
            <SelectItem value="sem_dono">Sem dono</SelectItem><SelectItem value="vencidas">Revalidação vencida</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0">
        {isLoading ? <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <div className="max-h-[70vh] overflow-auto">{cols.styleTag}<table data-cols="contas" className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card"><tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Conta</th><th className="hidden px-4 py-2.5 font-medium md:table-cell">Dono</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Revalidação</th><th className="hidden px-4 py-2.5 font-medium md:table-cell">Entra</th>
              <th className="px-4 py-2.5 font-medium">Situação</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={5}><EmptyState message="Nenhuma conta de serviço encontrada." /></td></tr>}
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => navigate(`/contas-servico/${c.id}`)}>
                  <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><IdentityAvatar nome={c.nome} className="rounded-lg" /><div className="min-w-0"><div className="font-medium text-primary">{c.nome}</div><div className="truncate text-xs text-muted-foreground">{c.email || c.sam_account_name || "—"}</div></div></div></td>
                  <td className="hidden px-4 py-2.5 md:table-cell">{donoNome(c.dono_colaborador_id) ?? <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">⚠ Sem dono</span>}</td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">{revalidacaoVencida(c, dias) ? <span className="font-medium text-warning">Vencida ({diasDesdeRevalidacao(c)}d)</span> : <span className="text-muted-foreground">{fmt(c.ultima_revalidacao)}</span>}</td>
                  <td className="hidden px-4 py-2.5 md:table-cell">{entraBadge(c)}</td>
                  <td className="px-4 py-2.5"><Badge variant={c.ativo ? "default" : "secondary"}>{c.ativo ? "Ativa" : "Desativada"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && navigate("/contas-servico")}>
        <DialogContent className="max-w-lg">
          {aberto && <>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" />{aberto.nome}</DialogTitle></DialogHeader>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Login</dt><dd>{aberto.sam_account_name || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">E-mail</dt><dd className="break-all">{aberto.email || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Dono</dt><dd>{donoNome(aberto.dono_colaborador_id) ?? <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">⚠ Sem dono</span>}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Criticidade</dt><dd>{CRIT[aberto.criticidade] ?? aberto.criticidade}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted-foreground">Finalidade</dt><dd>{aberto.finalidade || "—"}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted-foreground">Sistemas que usa</dt><dd>{aberto.sistemas || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Última revalidação</dt><dd>{fmt(aberto.ultima_revalidacao)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Último login</dt><dd>{fmt(aberto.ultimo_login)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">No Entra</dt><dd>{entraBadge(aberto)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Verificada pelo Hermes</dt><dd>{fmt(aberto.verificado_em)}</dd></div>
              {aberto.verificacao_detalhe && <div className="col-span-2 text-xs text-warning">{aberto.verificacao_detalhe}</div>}
            </dl>
            {canEdit && <DialogFooter className="flex-wrap gap-2 sm:justify-start">
              <Button variant="outline" size="sm" onClick={() => openEdit(aberto)}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
              {aberto.ativo && <Button variant="outline" size="sm" onClick={() => revalidar(aberto)}><CheckCircle2 className="mr-1 h-3 w-3" />Revalidar</Button>}
              {aberto.ativo
                ? <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDesativar(aberto)}><Power className="mr-1 h-3 w-3" />Desativar</Button>
                : <Button variant="outline" size="sm" onClick={() => alterarStatus(aberto, true)}><RefreshCcw className="mr-1 h-3 w-3" />Reativar</Button>}
            </DialogFooter>}
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Editar conta de serviço" : "Nova conta de serviço"}</DialogTitle></DialogHeader>
          {form && <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Login {editId ? "" : "*"}</Label><Input value={form.sam_account_name} disabled={!!editId} onChange={(e) => setForm({ ...form, sam_account_name: e.target.value.trim() })} placeholder="svc_sistema" /></div>
              <div className="space-y-2"><Label>E-mail</Label><Input value={form.email} disabled={!!editId} onChange={(e) => setForm({ ...form, email: e.target.value.trim() })} /></div>
            </div>
            <div className="space-y-2"><Label>Dono responsável</Label>
              <ColaboradorPicker value={form.dono_colaborador_id || null} onChange={(c) => setForm({ ...form, dono_colaborador_id: c?.id ?? "" })} placeholder="Selecione o dono..." />
            </div>
            <div className="space-y-2"><Label>Finalidade</Label><Textarea rows={2} value={form.finalidade} onChange={(e) => setForm({ ...form, finalidade: e.target.value })} placeholder="Para que serve esta conta" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Sistemas que usa</Label><Input value={form.sistemas} onChange={(e) => setForm({ ...form, sistemas: e.target.value })} /></div>
              <div className="space-y-2"><Label>Criticidade</Label>
                <Select value={form.criticidade} onValueChange={(v) => setForm({ ...form, criticidade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CRIT).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {!editId && <p className="text-xs text-muted-foreground">O Hermes cria a conta no diretório depois de salvar.</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!desativar} onOpenChange={(o) => !o && setDesativar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Desativar {desativar?.nome}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">O Hermes desabilita a conta e remove os acessos. O histórico é mantido.</p>
          <div className="space-y-2"><Label>Motivo *</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: integração descontinuada" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setDesativar(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={motivo.trim().length < 5} onClick={() => desativar && alterarStatus(desativar, false)}>Desativar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
