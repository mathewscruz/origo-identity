import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import { useAuth } from "@/contexts/AuthContext";
import {
  GitBranch, Plus, Trash2, ArrowDown, Clock, CheckCircle2, XCircle, Search,
  Pencil, Star, ChevronUp, ChevronDown, Users, KeyRound, AppWindow, ShieldCheck, UserCheck, MailCheck,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";

// ---------------------------------------------------------
// Tipos e constantes
// ---------------------------------------------------------

type Escopo = "solicitacao" | "excecao" | "jml";
type TipoAprovador = "gestor_direto" | "owner_recurso" | "usuario_especifico" | "papel";
type Modo = "qualquer_um" | "todos";
type AcaoTimeout = "escalar_proxima" | "auto_aprovar" | "auto_rejeitar";

const ESCOPO_LABEL: Record<Escopo, string> = {
  solicitacao: "Solicitações de Acesso",
  excecao: "Exceções de Acesso",
  jml: "Eventos JML",
};

const TIPO_APROVADOR_LABEL: Record<TipoAprovador, string> = {
  gestor_direto: "Gestor direto do solicitante",
  owner_recurso: "Owner do recurso solicitado",
  usuario_especifico: "Usuários específicos (e-mail)",
  papel: "Pessoas com papel no sistema",
};

const MODO_LABEL: Record<Modo, string> = {
  qualquer_um: "Qualquer um aprova",
  todos: "Todos devem aprovar",
};

const ACAO_TIMEOUT_LABEL: Record<AcaoTimeout, string> = {
  escalar_proxima: "Escalar para a próxima etapa",
  auto_aprovar: "Aprovar automaticamente",
  auto_rejeitar: "Rejeitar automaticamente",
};

const PAPEIS_DISPONIVEIS = ["admin", "auditor", "aprovador"] as const;

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  escopo: Escopo;
  is_default: boolean;
  prioridade: number;
  filtro_aplicacao_ids: string[];
  filtro_perfil_ids: string[];
  filtro_licenca_ids: string[];
  ativo: boolean;
}

interface Etapa {
  id: string;
  fluxo_id: string;
  ordem: number;
  nome: string;
  tipo_aprovador: TipoAprovador;
  papel: string | null;
  modo_aprovacao: Modo;
  timeout_horas: number;
  acao_timeout: AcaoTimeout;
  ativo: boolean;
}

interface Aprovador {
  id: string;
  etapa_id: string;
  email: string;
  nome: string | null;
}

// ---------------------------------------------------------
export default function WorkflowPage() {
  const { profile } = useAuth();
  const [fluxos, setFluxos] = useState<Fluxo[]>([]);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [aprovadores, setAprovadores] = useState<Aprovador[]>([]);
  const [execucoes, setExecucoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFluxo, setEditingFluxo] = useState<Fluxo | null>(null);

  // -----------------------------------------------------
  const fetchData = async () => {
    setLoading(true);
    const [{ data: f }, { data: e }, { data: a }, { data: ex }] = await Promise.all([
      supabase.from("workflow_fluxos").select("*").order("escopo").order("prioridade"),
      supabase.from("workflow_etapas").select("*").order("ordem"),
      supabase.from("workflow_etapa_aprovadores").select("*"),
      supabase.from("workflow_execucoes").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setFluxos((f as any) || []);
    setEtapas((e as any) || []);
    setAprovadores((a as any) || []);
    setExecucoes(ex || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // -----------------------------------------------------
  const openEditor = (fluxo: Fluxo | null) => {
    setEditingFluxo(fluxo);
    setEditorOpen(true);
  };

  const handleDeleteFluxo = async (fluxo: Fluxo) => {
    if (!confirm(`Excluir o fluxo "${fluxo.nome}"? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("workflow_fluxos").delete().eq("id", fluxo.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    await logAuditoria({
      acao: "excluir",
      entidade: "workflow_fluxo",
      entidade_id: fluxo.id,
      resumo: `Fluxo de workflow excluído: ${fluxo.nome}`,
      operador: profile?.email || "sistema",
    });
    toast({ title: "Fluxo excluído" });
    fetchData();
  };

  const handleToggleAtivo = async (fluxo: Fluxo) => {
    await supabase.from("workflow_fluxos").update({ ativo: !fluxo.ativo } as any).eq("id", fluxo.id);
    fetchData();
  };

  const handleSetDefault = async (fluxo: Fluxo) => {
    // Remove default dos demais fluxos do mesmo escopo
    await supabase.from("workflow_fluxos").update({ is_default: false } as any).eq("escopo", fluxo.escopo);
    await supabase.from("workflow_fluxos").update({ is_default: true } as any).eq("id", fluxo.id);
    toast({ title: "Fluxo definido como padrão" });
    fetchData();
  };

  // -----------------------------------------------------
  const etapasOf = (fluxoId: string) => etapas.filter(e => e.fluxo_id === fluxoId).sort((a, b) => a.ordem - b.ordem);
  const aprovadoresOf = (etapaId: string) => aprovadores.filter(a => a.etapa_id === etapaId);

  // -----------------------------------------------------
  const statusBadge = (status: string) => {
    switch (status) {
      case "pendente": return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
      case "aprovada": return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Aprovada</Badge>;
      case "rejeitada": return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejeitada</Badge>;
      case "escalada": return <Badge variant="secondary">Escalada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredExecucoes = execucoes.filter(e => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (e.aprovador_email || e.aprovador || "").toLowerCase().includes(q) || (e.status || "").toLowerCase().includes(q);
  });

  // -----------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflow de Aprovação</h1>
          <p className="text-muted-foreground">Configure fluxos de aprovação multi-etapa para solicitações, exceções e JML.</p>
        </div>
        <Button onClick={() => openEditor(null)}><Plus className="mr-2 h-4 w-4" />Novo Fluxo</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <GitBranch className="h-8 w-8 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{fluxos.length}</p><p className="text-xs text-muted-foreground">Fluxos cadastrados</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <div><p className="text-2xl font-bold">{fluxos.filter(f => f.ativo).length}</p><p className="text-xs text-muted-foreground">Fluxos ativos</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <UserCheck className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{etapas.length}</p><p className="text-xs text-muted-foreground">Etapas configuradas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <MailCheck className="h-8 w-8 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{execucoes.length}</p><p className="text-xs text-muted-foreground">Decisões registradas</p></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="fluxos">
        <TabsList>
          <TabsTrigger value="fluxos">Fluxos</TabsTrigger>
          <TabsTrigger value="execucoes">Execuções Recentes</TabsTrigger>
        </TabsList>

        <TabsContent value="fluxos" className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : fluxos.length === 0 ? (
            <EmptyState message="Nenhum fluxo cadastrado. Crie o primeiro para começar." />
          ) : (
            (["solicitacao", "excecao", "jml"] as Escopo[]).map(escopo => {
              const list = fluxos.filter(f => f.escopo === escopo);
              if (list.length === 0) return null;
              return (
                <div key={escopo} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{ESCOPO_LABEL[escopo]}</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {list.map(fluxo => {
                      const eList = etapasOf(fluxo.id);
                      return (
                        <Card key={fluxo.id}>
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <CardTitle className="text-base flex items-center gap-2">
                                  {fluxo.nome}
                                  {fluxo.is_default && <Badge variant="outline" className="text-yellow-600 border-yellow-500"><Star className="h-3 w-3 mr-1" />Padrão</Badge>}
                                </CardTitle>
                                {fluxo.descricao && <CardDescription className="mt-1">{fluxo.descricao}</CardDescription>}
                              </div>
                              <div className="flex items-center gap-1">
                                <Switch checked={fluxo.ativo} onCheckedChange={() => handleToggleAtivo(fluxo)} />
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {eList.length === 0 ? (
                              <p className="text-sm text-muted-foreground italic">Nenhuma etapa — aprovação automática.</p>
                            ) : (
                              <div className="space-y-2">
                                {eList.map((etapa, idx) => (
                                  <div key={etapa.id}>
                                    <div className="flex items-start gap-3 p-2 rounded-lg border bg-muted/30">
                                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                                        {etapa.ordem}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{etapa.nome}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {TIPO_APROVADOR_LABEL[etapa.tipo_aprovador]}
                                          {etapa.tipo_aprovador === "papel" && etapa.papel && ` (${etapa.papel})`}
                                          {etapa.tipo_aprovador === "usuario_especifico" && ` — ${aprovadoresOf(etapa.id).length} pessoa(s)`}
                                          {" · "}{MODO_LABEL[etapa.modo_aprovacao]} · {etapa.timeout_horas}h
                                        </p>
                                      </div>
                                    </div>
                                    {idx < eList.length - 1 && (
                                      <div className="flex justify-center py-0.5"><ArrowDown className="h-3 w-3 text-muted-foreground" /></div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                              {!fluxo.is_default && (
                                <Button size="sm" variant="ghost" onClick={() => handleSetDefault(fluxo)}><Star className="h-3.5 w-3.5 mr-1" />Definir padrão</Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => openEditor(fluxo)}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Button>
                              <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => handleDeleteFluxo(fluxo)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="execucoes" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar execuções..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Solicitação</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Aprovador</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Comentário</TableHead>
                <TableHead>Data</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filteredExecucoes.length === 0 ? (
                  <TableRow><TableCell colSpan={6}><EmptyState message="Nenhuma execução registrada" /></TableCell></TableRow>
                ) : filteredExecucoes.map(e => {
                  const etapa = etapas.find(x => x.id === e.etapa_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs font-mono">{(e.solicitacao_id || e.entidade_id || "").slice(0, 8)}</TableCell>
                      <TableCell>{etapa ? `${etapa.ordem}. ${etapa.nome}` : `Etapa ${e.ordem || "—"}`}</TableCell>
                      <TableCell className="text-sm">{e.aprovador_email || e.aprovador || "—"}</TableCell>
                      <TableCell>{statusBadge(e.status)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">{e.comentario || "—"}</TableCell>
                      <TableCell className="text-sm">{e.data_decisao ? new Date(e.data_decisao).toLocaleString("pt-BR") : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <FluxoEditor
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditingFluxo(null); }}
        fluxo={editingFluxo}
        onSaved={fetchData}
      />
    </div>
  );
}

// =====================================================================
// Editor de Fluxo
// =====================================================================

interface EditorProps {
  open: boolean;
  onClose: () => void;
  fluxo: Fluxo | null;
  onSaved: () => void;
}

interface EtapaDraft {
  id?: string;
  ordem: number;
  nome: string;
  tipo_aprovador: TipoAprovador;
  papel: string | null;
  modo_aprovacao: Modo;
  timeout_horas: number;
  acao_timeout: AcaoTimeout;
  ativo: boolean;
  aprovadores: { id?: string; email: string; nome: string | null }[];
}

function FluxoEditor({ open, onClose, fluxo, onSaved }: EditorProps) {
  const { profile } = useAuth();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [escopo, setEscopo] = useState<Escopo>("solicitacao");
  const [prioridade, setPrioridade] = useState(100);
  const [ativo, setAtivo] = useState(true);
  const [filtroApps, setFiltroApps] = useState<string[]>([]);
  const [filtroPerfis, setFiltroPerfis] = useState<string[]>([]);
  const [filtroLicencas, setFiltroLicencas] = useState<string[]>([]);
  const [etapasDraft, setEtapasDraft] = useState<EtapaDraft[]>([]);

  const [aplicacoes, setAplicacoes] = useState<any[]>([]);
  const [perfis, setPerfis] = useState<any[]>([]);
  const [licencas, setLicencas] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  // Reload form when opening
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: a }, { data: p }, { data: l }] = await Promise.all([
        supabase.from("aplicacoes").select("id, nome").order("nome"),
        supabase.from("perfis_acesso").select("id, nome").order("nome"),
        supabase.from("licencas").select("id, nome").order("nome"),
      ]);
      setAplicacoes(a || []);
      setPerfis(p || []);
      setLicencas(l || []);

      if (fluxo) {
        setNome(fluxo.nome);
        setDescricao(fluxo.descricao || "");
        setEscopo(fluxo.escopo);
        setPrioridade(fluxo.prioridade);
        setAtivo(fluxo.ativo);
        setFiltroApps(fluxo.filtro_aplicacao_ids || []);
        setFiltroPerfis(fluxo.filtro_perfil_ids || []);
        setFiltroLicencas(fluxo.filtro_licenca_ids || []);

        const { data: etapasDb } = await supabase
          .from("workflow_etapas")
          .select("*")
          .eq("fluxo_id", fluxo.id)
          .order("ordem");
        const etapaIds = (etapasDb || []).map((e: any) => e.id);
        const { data: aprDb } = etapaIds.length
          ? await supabase.from("workflow_etapa_aprovadores").select("*").in("etapa_id", etapaIds)
          : { data: [] };
        setEtapasDraft(
          (etapasDb || []).map((e: any) => ({
            id: e.id,
            ordem: e.ordem,
            nome: e.nome,
            tipo_aprovador: e.tipo_aprovador,
            papel: e.papel,
            modo_aprovacao: e.modo_aprovacao,
            timeout_horas: e.timeout_horas,
            acao_timeout: e.acao_timeout,
            ativo: e.ativo,
            aprovadores: (aprDb || []).filter((x: any) => x.etapa_id === e.id).map((x: any) => ({ id: x.id, email: x.email, nome: x.nome })),
          })),
        );
      } else {
        setNome("");
        setDescricao("");
        setEscopo("solicitacao");
        setPrioridade(100);
        setAtivo(true);
        setFiltroApps([]);
        setFiltroPerfis([]);
        setFiltroLicencas([]);
        setEtapasDraft([
          {
            ordem: 1,
            nome: "Aprovação do Gestor",
            tipo_aprovador: "gestor_direto",
            papel: null,
            modo_aprovacao: "qualquer_um",
            timeout_horas: 48,
            acao_timeout: "escalar_proxima",
            ativo: true,
            aprovadores: [],
          },
        ]);
      }
    })();
  }, [open, fluxo]);

  const addEtapa = () => {
    setEtapasDraft(prev => [...prev, {
      ordem: prev.length + 1,
      nome: `Etapa ${prev.length + 1}`,
      tipo_aprovador: "owner_recurso",
      papel: null,
      modo_aprovacao: "qualquer_um",
      timeout_horas: 48,
      acao_timeout: "escalar_proxima",
      ativo: true,
      aprovadores: [],
    }]);
  };

  const moveEtapa = (idx: number, dir: -1 | 1) => {
    setEtapasDraft(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((e, i) => ({ ...e, ordem: i + 1 }));
    });
  };

  const removeEtapa = (idx: number) => {
    setEtapasDraft(prev => prev.filter((_, i) => i !== idx).map((e, i) => ({ ...e, ordem: i + 1 })));
  };

  const updateEtapa = (idx: number, patch: Partial<EtapaDraft>) => {
    setEtapasDraft(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast({ title: "Informe o nome do fluxo", variant: "destructive" });
      return;
    }
    if (etapasDraft.some(e => !e.nome.trim())) {
      toast({ title: "Todas as etapas precisam de nome", variant: "destructive" });
      return;
    }
    if (etapasDraft.some(e => e.tipo_aprovador === "papel" && !e.papel)) {
      toast({ title: "Selecione o papel para etapas do tipo 'papel'", variant: "destructive" });
      return;
    }
    if (etapasDraft.some(e => e.tipo_aprovador === "usuario_especifico" && e.aprovadores.length === 0)) {
      toast({ title: "Adicione ao menos um aprovador para etapas do tipo 'usuários específicos'", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let fluxoId = fluxo?.id;
      const fluxoPayload = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        escopo,
        prioridade,
        ativo,
        filtro_aplicacao_ids: filtroApps,
        filtro_perfil_ids: filtroPerfis,
        filtro_licenca_ids: filtroLicencas,
      };

      if (fluxoId) {
        const { error } = await supabase.from("workflow_fluxos").update(fluxoPayload as any).eq("id", fluxoId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("workflow_fluxos").insert(fluxoPayload as any).select("id").single();
        if (error) throw error;
        fluxoId = data!.id;
      }

      // Remove etapas que sumiram do draft (only when editing)
      if (fluxo) {
        const draftIds = etapasDraft.map(e => e.id).filter(Boolean) as string[];
        const { data: oldEtapas } = await supabase.from("workflow_etapas").select("id").eq("fluxo_id", fluxoId!);
        const toDelete = (oldEtapas || []).map((e: any) => e.id).filter((id: string) => !draftIds.includes(id));
        if (toDelete.length > 0) {
          await supabase.from("workflow_etapas").delete().in("id", toDelete);
        }
      }

      // Upsert etapas
      for (const e of etapasDraft) {
        const etapaPayload = {
          fluxo_id: fluxoId,
          ordem: e.ordem,
          nome: e.nome.trim(),
          tipo_aprovador: e.tipo_aprovador,
          papel: e.tipo_aprovador === "papel" ? e.papel : null,
          modo_aprovacao: e.modo_aprovacao,
          timeout_horas: e.timeout_horas,
          acao_timeout: e.acao_timeout,
          ativo: e.ativo,
        };
        let etapaId = e.id;
        if (etapaId) {
          await supabase.from("workflow_etapas").update(etapaPayload as any).eq("id", etapaId);
        } else {
          const { data } = await supabase.from("workflow_etapas").insert(etapaPayload as any).select("id").single();
          etapaId = data?.id;
        }
        if (!etapaId) continue;

        // Sync aprovadores
        await supabase.from("workflow_etapa_aprovadores").delete().eq("etapa_id", etapaId);
        if (e.tipo_aprovador === "usuario_especifico" && e.aprovadores.length > 0) {
          await supabase.from("workflow_etapa_aprovadores").insert(
            e.aprovadores.map(a => ({ etapa_id: etapaId, email: a.email.trim().toLowerCase(), nome: a.nome || null })) as any
          );
        }
      }

      await logAuditoria({
        acao: fluxo ? "atualizar" : "criar",
        entidade: "workflow_fluxo",
        entidade_id: fluxoId,
        resumo: `Fluxo de workflow ${fluxo ? "atualizado" : "criado"}: ${nome}`,
        operador: profile?.email || "sistema",
      });

      toast({ title: `Fluxo ${fluxo ? "atualizado" : "criado"} com sucesso` });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao salvar fluxo", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------
  const toggleId = (list: string[], setter: (v: string[]) => void, id: string) => {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fluxo ? "Editar Fluxo" : "Novo Fluxo de Aprovação"}</DialogTitle>
          <DialogDescription>
            Defina o escopo, filtros e a sequência de etapas. Cada etapa pode ter um ou vários aprovadores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cabeçalho */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Nome do fluxo</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Aprovação para apps críticos" />
            </div>
            <div className="md:col-span-2">
              <Label>Descrição (opcional)</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Escopo</Label>
              <Select value={escopo} onValueChange={v => setEscopo(v as Escopo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["solicitacao", "excecao", "jml"] as Escopo[]).map(esc => (
                    <SelectItem key={esc} value={esc}>{ESCOPO_LABEL[esc]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade (menor = mais prioritário)</Label>
              <Input type="number" value={prioridade} onChange={e => setPrioridade(parseInt(e.target.value) || 100)} />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              <Label>Fluxo ativo</Label>
            </div>
          </div>

          {/* Filtros */}
          {escopo === "solicitacao" && (
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">Filtros (opcional — aplica este fluxo apenas se ao menos um item da solicitação for um dos selecionados):</p>
              <FiltroCheckList icon={<AppWindow className="h-4 w-4" />} label="Aplicações" items={aplicacoes} selected={filtroApps} onToggle={(id) => toggleId(filtroApps, setFiltroApps, id)} />
              <FiltroCheckList icon={<ShieldCheck className="h-4 w-4" />} label="Perfis" items={perfis} selected={filtroPerfis} onToggle={(id) => toggleId(filtroPerfis, setFiltroPerfis, id)} />
              <FiltroCheckList icon={<KeyRound className="h-4 w-4" />} label="Licenças" items={licencas} selected={filtroLicencas} onToggle={(id) => toggleId(filtroLicencas, setFiltroLicencas, id)} />
              <p className="text-xs text-muted-foreground">Sem filtros, o fluxo só será aplicado se nenhum outro fluxo específico bater (fallback).</p>
            </div>
          )}

          {/* Etapas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Etapas de aprovação</p>
              <Button size="sm" variant="outline" onClick={addEtapa}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar etapa</Button>
            </div>
            {etapasDraft.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Sem etapas — solicitações serão aprovadas automaticamente.</p>
            )}
            {etapasDraft.map((etapa, idx) => (
              <Card key={idx} className="bg-muted/30">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{etapa.ordem}</div>
                    <Input value={etapa.nome} onChange={e => updateEtapa(idx, { nome: e.target.value })} placeholder="Nome da etapa" className="flex-1" />
                    <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => moveEtapa(idx, -1)}><ChevronUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" disabled={idx === etapasDraft.length - 1} onClick={() => moveEtapa(idx, 1)}><ChevronDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeEtapa(idx)}><Trash2 className="h-4 w-4" /></Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Tipo de aprovador</Label>
                      <Select value={etapa.tipo_aprovador} onValueChange={v => updateEtapa(idx, { tipo_aprovador: v as TipoAprovador })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TIPO_APROVADOR_LABEL) as TipoAprovador[]).map(t => (
                            <SelectItem key={t} value={t}>{TIPO_APROVADOR_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Modo</Label>
                      <Select value={etapa.modo_aprovacao} onValueChange={v => updateEtapa(idx, { modo_aprovacao: v as Modo })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MODO_LABEL) as Modo[]).map(m => (
                            <SelectItem key={m} value={m}>{MODO_LABEL[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {etapa.tipo_aprovador === "papel" && (
                      <div>
                        <Label className="text-xs">Papel</Label>
                        <Select value={etapa.papel || ""} onValueChange={v => updateEtapa(idx, { papel: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {PAPEIS_DISPONIVEIS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Timeout (horas)</Label>
                      <Input type="number" value={etapa.timeout_horas} onChange={e => updateEtapa(idx, { timeout_horas: parseInt(e.target.value) || 48 })} />
                    </div>
                    <div>
                      <Label className="text-xs">No timeout</Label>
                      <Select value={etapa.acao_timeout} onValueChange={v => updateEtapa(idx, { acao_timeout: v as AcaoTimeout })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ACAO_TIMEOUT_LABEL) as AcaoTimeout[]).map(a => (
                            <SelectItem key={a} value={a}>{ACAO_TIMEOUT_LABEL[a]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {etapa.tipo_aprovador === "usuario_especifico" && (
                    <AprovadoresEditor
                      aprovadores={etapa.aprovadores}
                      onChange={(novos) => updateEtapa(idx, { aprovadores: novos })}
                    />
                  )}

                  {etapa.tipo_aprovador === "owner_recurso" && (
                    <p className="text-xs text-muted-foreground">
                      Os aprovadores serão automaticamente os owners cadastrados nas aplicações, grupos e licenças solicitados.
                    </p>
                  )}
                  {etapa.tipo_aprovador === "gestor_direto" && (
                    <p className="text-xs text-muted-foreground">
                      O aprovador será o gestor cadastrado no perfil do colaborador solicitante.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar fluxo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Componentes auxiliares
// =====================================================================

function FiltroCheckList({ icon, label, items, selected, onToggle }: { icon: React.ReactNode; label: string; items: any[]; selected: string[]; onToggle: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const filtered = items.filter(i => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()));
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-medium">{label}</span>
        {selected.length > 0 && <Badge variant="secondary" className="text-xs">{selected.length} selecionada(s)</Badge>}
      </div>
      <Input placeholder={`Buscar ${label.toLowerCase()}...`} value={busca} onChange={e => setBusca(e.target.value)} className="mb-1 h-8" />
      <div className="max-h-32 overflow-y-auto border rounded">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Nenhum item</p>
        ) : filtered.slice(0, 50).map(item => (
          <label key={item.id} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-muted cursor-pointer">
            <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} />
            {item.nome}
          </label>
        ))}
      </div>
    </div>
  );
}

function AprovadoresEditor({ aprovadores, onChange }: { aprovadores: { email: string; nome: string | null }[]; onChange: (n: { email: string; nome: string | null }[]) => void }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");

  const add = () => {
    if (!email.trim() || !email.includes("@")) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return;
    }
    onChange([...aprovadores, { email: email.trim().toLowerCase(), nome: nome.trim() || null }]);
    setEmail("");
    setNome("");
  };
  const remove = (idx: number) => onChange(aprovadores.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2 p-2 rounded border bg-background">
      <Label className="text-xs flex items-center gap-2"><Users className="h-3.5 w-3.5" />Aprovadores nominais</Label>
      <div className="flex gap-2">
        <Input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="flex-1" />
        <Input placeholder="Nome (opcional)" value={nome} onChange={e => setNome(e.target.value)} className="flex-1" />
        <Button size="sm" onClick={add}>Adicionar</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {aprovadores.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum aprovador adicionado.</p>}
        {aprovadores.map((a, i) => (
          <Badge key={i} variant="secondary" className="gap-1">
            {a.nome || a.email}
            <button onClick={() => remove(i)} className="ml-1 hover:text-destructive"><XCircle className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
