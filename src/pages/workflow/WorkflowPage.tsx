import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import { useAuth } from "@/contexts/AuthContext";
import { GitBranch, Plus, Trash2, ArrowDown, Clock, CheckCircle2, XCircle, Search } from "lucide-react";

const APROVADOR_TIPOS = [
  { value: "gestor", label: "Gestor Direto" },
  { value: "owner", label: "Owner do Sistema" },
  { value: "ti", label: "Equipe de TI" },
];

const ENTIDADE_TIPOS = [
  { value: "solicitacao", label: "Solicitação de Acesso" },
  { value: "excecao", label: "Exceção de Acesso" },
];

export default function WorkflowPage() {
  const { profile } = useAuth();
  const [etapas, setEtapas] = useState<any[]>([]);
  const [execucoes, setExecucoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busca, setBusca] = useState("");

  // form
  const [entidadeTipo, setEntidadeTipo] = useState("solicitacao");
  const [aprovadorTipo, setAprovadorTipo] = useState("gestor");
  const [timeoutHoras, setTimeoutHoras] = useState("48");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: e }, { data: ex }] = await Promise.all([
      supabase.from("workflow_etapas").select("*").order("entidade_tipo").order("ordem"),
      supabase.from("workflow_execucoes").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setEtapas(e || []);
    setExecucoes(ex || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    // Calculate next order
    const existing = etapas.filter(e => e.entidade_tipo === entidadeTipo);
    const nextOrdem = existing.length > 0 ? Math.max(...existing.map(e => e.ordem)) + 1 : 1;

    const { error } = await supabase.from("workflow_etapas").insert({
      entidade_tipo: entidadeTipo,
      ordem: nextOrdem,
      aprovador_tipo: aprovadorTipo,
      timeout_horas: parseInt(timeoutHoras) || 48,
    } as any);

    if (error) {
      toast({ title: "Erro ao criar etapa", description: error.message, variant: "destructive" });
      return;
    }

    await logAuditoria({
      acao: "criar",
      entidade: "workflow_etapa",
      resumo: `Etapa de workflow criada: ${APROVADOR_TIPOS.find(a => a.value === aprovadorTipo)?.label} para ${entidadeTipo}`,
      operador: profile?.email || "sistema",
    });

    toast({ title: "Etapa adicionada ao workflow" });
    setDialogOpen(false);
    setAprovadorTipo("gestor");
    setTimeoutHoras("48");
    fetchData();
  };

  const handleDelete = async (etapa: any) => {
    const { error } = await supabase.from("workflow_etapas").delete().eq("id", etapa.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    await logAuditoria({
      acao: "excluir",
      entidade: "workflow_etapa",
      entidade_id: etapa.id,
      resumo: "Etapa de workflow excluída",
      operador: profile?.email || "sistema",
    });
    toast({ title: "Etapa excluída" });
    fetchData();
  };

  const handleToggle = async (etapa: any) => {
    await supabase.from("workflow_etapas").update({ ativo: !etapa.ativo } as any).eq("id", etapa.id);
    fetchData();
  };

  const etapasSolicitacao = etapas.filter(e => e.entidade_tipo === "solicitacao");
  const etapasExcecao = etapas.filter(e => e.entidade_tipo === "excecao");

  const etapaMap = new Map(etapas.map(e => [e.id, e]));

  const statusBadge = (status: string) => {
    switch (status) {
      case "pendente": return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
      case "aprovada": return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Aprovada</Badge>;
      case "rejeitada": return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejeitada</Badge>;
      case "escalada": return <Badge variant="secondary">Escalada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderEtapasChain = (list: any[]) => (
    <div className="flex flex-col gap-2">
      {list.length === 0 ? (
        <EmptyState message="Nenhuma etapa configurada" />
      ) : list.map((etapa, idx) => (
        <div key={etapa.id}>
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
              {etapa.ordem}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{APROVADOR_TIPOS.find(a => a.value === etapa.aprovador_tipo)?.label || etapa.aprovador_tipo}</p>
              <p className="text-xs text-muted-foreground">Timeout: {etapa.timeout_horas}h</p>
            </div>
            <Badge variant={etapa.ativo ? "default" : "secondary"} className="cursor-pointer" onClick={() => handleToggle(etapa)}>
              {etapa.ativo ? "Ativo" : "Inativo"}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(etapa)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          {idx < list.length - 1 && (
            <div className="flex justify-center py-1">
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const filteredExecucoes = execucoes.filter(e => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (e.aprovador || "").toLowerCase().includes(q) || e.status.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflow de Aprovação</h1>
          <p className="text-muted-foreground">Configure fluxos de aprovação multi-nível</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova Etapa</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <GitBranch className="h-8 w-8 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{etapas.length}</p><p className="text-xs text-muted-foreground">Etapas configuradas</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-primary font-bold text-sm">{etapasSolicitacao.length}</span></div>
          <div><p className="text-xs text-muted-foreground">Etapas p/ Solicitações</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center"><span className="text-primary font-bold text-sm">{etapasExcecao.length}</span></div>
          <div><p className="text-xs text-muted-foreground">Etapas p/ Exceções</p></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="solicitacao">
        <TabsList>
          <TabsTrigger value="solicitacao">Solicitações ({etapasSolicitacao.length} etapas)</TabsTrigger>
          <TabsTrigger value="excecao">Exceções ({etapasExcecao.length} etapas)</TabsTrigger>
          <TabsTrigger value="execucoes">Execuções Recentes</TabsTrigger>
        </TabsList>

        <TabsContent value="solicitacao" className="space-y-4">
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fluxo de Aprovação — Solicitações de Acesso</CardTitle>
              <CardDescription>Defina a cadeia de aprovadores para novas solicitações</CardDescription>
            </CardHeader>
            <CardContent>{renderEtapasChain(etapasSolicitacao)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="excecao" className="space-y-4">
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fluxo de Aprovação — Exceções de Acesso</CardTitle>
              <CardDescription>Defina a cadeia de aprovadores para exceções</CardDescription>
            </CardHeader>
            <CardContent>{renderEtapasChain(etapasExcecao)}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="execucoes" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar execuções..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tipo</TableHead>
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
                  const etapa = etapaMap.get(e.etapa_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell><Badge variant="outline">{e.entidade_tipo}</Badge></TableCell>
                      <TableCell>{etapa ? `${etapa.ordem}. ${APROVADOR_TIPOS.find(a => a.value === etapa.aprovador_tipo)?.label || etapa.aprovador_tipo}` : "—"}</TableCell>
                      <TableCell>{e.aprovador || "—"}</TableCell>
                      <TableCell>{statusBadge(e.status)}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">{e.comentario || "—"}</TableCell>
                      <TableCell>{e.data_decisao ? new Date(e.data_decisao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog nova etapa */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Etapa de Aprovação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo de Entidade</label>
              <Select value={entidadeTipo} onValueChange={setEntidadeTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENTIDADE_TIPOS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo de Aprovador</label>
              <Select value={aprovadorTipo} onValueChange={setAprovadorTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APROVADOR_TIPOS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Timeout (horas)</label>
              <Input type="number" value={timeoutHoras} onChange={e => setTimeoutHoras(e.target.value)} placeholder="48" />
              <p className="text-xs text-muted-foreground mt-1">Após esse período sem decisão, escala para a próxima etapa</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
