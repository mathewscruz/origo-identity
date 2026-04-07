import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { logAuditoria } from "@/lib/auditLogger";
import { useAuth } from "@/contexts/AuthContext";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";
import { HandHelping, Plus, Search, Clock, CheckCircle2, XCircle, Send, ExternalLink } from "lucide-react";

export default function SolicitacoesPage() {
  const { profile } = useAuth();
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [perfis, setPerfis] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<any>(null);
  const [busca, setBusca] = useState("");

  // form
  const [solicitanteId, setSolicitanteId] = useState("");
  const [perfilId, setPerfilId] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [buscaColab, setBuscaColab] = useState("");
  const [buscaPerfil, setBuscaPerfil] = useState("");

  // decision
  const [decisao, setDecisao] = useState("");
  const [comentario, setComentario] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: s }, { data: p }, { data: c }] = await Promise.all([
      supabase.from("solicitacoes_acesso").select("*").order("created_at", { ascending: false }),
      supabase.from("perfis_acesso").select("id, nome, tipo").eq("ativo", true).order("nome"),
      supabase.from("colaboradores").select("id, nome, email").eq("status", "ativo").order("nome"),
    ]);
    setSolicitacoes(s || []);
    setPerfis(p || []);
    setColaboradores(c || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const colabMap = new Map(colaboradores.map(c => [c.id, c]));
  const perfilMap = new Map(perfis.map(p => [p.id, p]));

  const handleSubmit = async () => {
    if (!solicitanteId || !perfilId || !justificativa.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    // Check if workflow etapas exist for solicitacao
    const { data: etapas } = await supabase
      .from("workflow_etapas")
      .select("*")
      .eq("entidade_tipo", "solicitacao")
      .eq("ativo", true)
      .order("ordem");

    const { data: inserted, error } = await supabase.from("solicitacoes_acesso").insert({
      solicitante_id: solicitanteId,
      perfil_id: perfilId,
      justificativa: justificativa.trim(),
      status: (etapas && etapas.length > 0) ? "em_aprovacao" : "pendente",
    } as any).select("id").single();

    if (error) {
      toast({ title: "Erro ao criar solicitação", description: error.message, variant: "destructive" });
      return;
    }

    // Create workflow_execucoes for each etapa
    if (etapas && etapas.length > 0 && inserted?.id) {
      const execucoes = etapas.map((et: any) => ({
        entidade_id: inserted.id,
        entidade_tipo: "solicitacao",
        etapa_id: et.id,
        status: "pendente",
      }));
      await supabase.from("workflow_execucoes").insert(execucoes as any);
    }

    const colabNome = colabMap.get(solicitanteId)?.nome || "—";
    const perfilNome = perfilMap.get(perfilId)?.nome || "—";

    await logAuditoria({
      acao: "criar",
      entidade: "solicitacao_acesso",
      entidade_id: inserted?.id,
      resumo: `Solicitação de acesso: ${colabNome} → ${perfilNome}${etapas && etapas.length > 0 ? ` (workflow: ${etapas.length} etapas)` : ""}`,
      operador: profile?.email || "sistema",
    });

    toast({ title: "Solicitação criada com sucesso", description: etapas && etapas.length > 0 ? `Encaminhada para workflow com ${etapas.length} etapa(s) de aprovação.` : undefined });
    setDialogOpen(false);
    setSolicitanteId("");
    setPerfilId("");
    setJustificativa("");
    setBuscaColab("");
    setBuscaPerfil("");
    fetchData();
  };

  const handleDecision = async () => {
    if (!decisionDialog || !decisao) return;

    const { error } = await supabase.from("solicitacoes_acesso").update({
      status: decisao,
      aprovador: profile?.email || "sistema",
      comentario: comentario || null,
      data_decisao: new Date().toISOString(),
    } as any).eq("id", decisionDialog.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    // If approved, create perfil_atribuicao AND provision in Entra ID
    if (decisao === "aprovada") {
      await supabase.from("perfil_atribuicoes").insert({
        colaborador_id: decisionDialog.solicitante_id,
        perfil_id: decisionDialog.perfil_id,
        origem: "solicitacao",
        ativo: true,
      } as any);

      // Queue Entra ID provisioning
      const { data: colab } = await supabase
        .from("colaboradores")
        .select("id, nome, email, sam_account_name")
        .eq("id", decisionDialog.solicitante_id)
        .single();
      if (colab && (colab.email || colab.sam_account_name)) {
        await queueFullProfileActions(
          [{ id: colab.id, nome: colab.nome, email: colab.email, sam_account_name: colab.sam_account_name }],
          [decisionDialog.perfil_id],
          "assign"
        );
      }
    }

    const colabNome = colabMap.get(decisionDialog.solicitante_id)?.nome || "—";
    const perfilNome = perfilMap.get(decisionDialog.perfil_id)?.nome || "—";

    await logAuditoria({
      acao: decisao === "aprovada" ? "aprovar" : "rejeitar",
      entidade: "solicitacao_acesso",
      entidade_id: decisionDialog.id,
      resumo: `Solicitação ${decisao}: ${colabNome} → ${perfilNome}`,
      operador: profile?.email || "sistema",
      detalhes: { comentario },
    });

    toast({ title: `Solicitação ${decisao === "aprovada" ? "aprovada" : "rejeitada"}` });
    setDecisionDialog(null);
    setDecisao("");
    setComentario("");
    fetchData();
  };

  const pendentes = solicitacoes.filter(s => s.status === "pendente");
  const decididas = solicitacoes.filter(s => s.status !== "pendente");

  const filtered = (list: any[]) => list.filter(s => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    const cNome = colabMap.get(s.solicitante_id)?.nome?.toLowerCase() || "";
    const pNome = perfilMap.get(s.perfil_id)?.nome?.toLowerCase() || "";
    return cNome.includes(q) || pNome.includes(q) || (s.justificativa || "").toLowerCase().includes(q);
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "pendente": return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="mr-1 h-3 w-3" />Pendente</Badge>;
      case "aprovada": return <Badge className="bg-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Aprovada</Badge>;
      case "rejeitada": return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejeitada</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredColabs = colaboradores.filter(c => !buscaColab || c.nome.toLowerCase().includes(buscaColab.toLowerCase()));
  const filteredPerfis = perfis.filter(p => !buscaPerfil || p.nome.toLowerCase().includes(buscaPerfil.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Solicitações de Acesso</h1>
          <p className="text-muted-foreground">Self-Service — solicite e gerencie acessos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="https://iam.origoenergia.com.br/solicitacoes" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />Portal Externo
            </a>
          </Button>
          <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova Solicitação</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <HandHelping className="h-8 w-8 text-muted-foreground" />
          <div><p className="text-2xl font-bold">{solicitacoes.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-yellow-500" />
          <div><p className="text-2xl font-bold">{pendentes.length}</p><p className="text-xs text-muted-foreground">Pendentes</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-green-500" />
          <div><p className="text-2xl font-bold">{decididas.length}</p><p className="text-xs text-muted-foreground">Decididas</p></div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar solicitações..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({decididas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Solicitante</TableHead>
                <TableHead>Perfil Solicitado</TableHead>
                <TableHead>Justificativa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : filtered(pendentes).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma solicitação pendente</TableCell></TableRow>
                ) : filtered(pendentes).map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{colabMap.get(s.solicitante_id)?.nome || "—"}</TableCell>
                    <TableCell>{perfilMap.get(s.perfil_id)?.nome || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{s.justificativa}</TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="text-green-600" onClick={() => { setDecisionDialog(s); setDecisao("aprovada"); }}>Aprovar</Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setDecisionDialog(s); setDecisao("rejeitada"); }}>Rejeitar</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Solicitante</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aprovador</TableHead>
                <TableHead>Comentário</TableHead>
                <TableHead>Decisão em</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered(decididas).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum histórico</TableCell></TableRow>
                ) : filtered(decididas).map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{colabMap.get(s.solicitante_id)?.nome || "—"}</TableCell>
                    <TableCell>{perfilMap.get(s.perfil_id)?.nome || "—"}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>{s.aprovador || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{s.comentario || "—"}</TableCell>
                    <TableCell>{s.data_decisao ? new Date(s.data_decisao).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Nova Solicitação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Solicitação de Acesso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Colaborador</label>
              <Input placeholder="Buscar colaborador..." value={buscaColab} onChange={e => setBuscaColab(e.target.value)} className="mb-2" />
              <Select value={solicitanteId} onValueChange={setSolicitanteId}>
                <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                <SelectContent>
                  {filteredColabs.slice(0, 50).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}{c.email ? ` (${c.email})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Perfil de Acesso</label>
              <Input placeholder="Buscar perfil..." value={buscaPerfil} onChange={e => setBuscaPerfil(e.target.value)} className="mb-2" />
              <Select value={perfilId} onValueChange={setPerfilId}>
                <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                <SelectContent>
                  {filteredPerfis.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} ({p.tipo})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Justificativa</label>
              <Textarea value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Explique por que este acesso é necessário..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}><Send className="mr-2 h-4 w-4" />Enviar Solicitação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision Dialog */}
      <Dialog open={!!decisionDialog} onOpenChange={() => setDecisionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisao === "aprovada" ? "Aprovar" : "Rejeitar"} Solicitação</DialogTitle>
          </DialogHeader>
          {decisionDialog && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <p><strong>Solicitante:</strong> {colabMap.get(decisionDialog.solicitante_id)?.nome || "—"}</p>
                <p><strong>Perfil:</strong> {perfilMap.get(decisionDialog.perfil_id)?.nome || "—"}</p>
                <p><strong>Justificativa:</strong> {decisionDialog.justificativa}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Comentário (opcional)</label>
                <Textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Adicione um comentário sobre a decisão..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog(null)}>Cancelar</Button>
            <Button variant={decisao === "aprovada" ? "default" : "destructive"} onClick={handleDecision}>
              {decisao === "aprovada" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
