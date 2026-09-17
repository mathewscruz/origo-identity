import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Plus, X, UserX, RotateCcw, Info, Workflow, ShieldCheck } from "lucide-react";
import StartJmlEventDialog from "@/components/jml/StartJmlEventDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTerceiro, usePerfisAcesso, useParametro } from "@/hooks/useOrigoData";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";
import { desligarTerceiro, reativarTerceiro } from "@/lib/iam/terceiroLifecycle";
import EmptyState from "@/components/EmptyState";
import { humanize } from "@/lib/labels";

const criticidadeConfig: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "bg-muted text-muted-foreground" },
  media: { label: "Média", class: "bg-info/15 text-info border-info/30" },
  alta: { label: "Alta", class: "bg-warning/15 text-warning border-warning/30" },
  critica: { label: "Crítica", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

function contractProgress(inicio: string | null, fim: string | null): number {
  if (!inicio || !fim) return 0;
  const start = new Date(inicio).getTime();
  const end = new Date(fim).getTime();
  const now = Date.now();
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

function diasRestantes(dataFim: string | null): number {
  if (!dataFim) return 999;
  return Math.ceil((new Date(dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function TerceiroDetalhePage() {
  const { id } = useParams();
  const { data: terceiro, isLoading } = useTerceiro(id);
  const navigate = useNavigate();
  const [renovarOpen, setRenovarOpen] = useState(false);
  const [renovarForm, setRenovarForm] = useState({ novo_fim: "", motivo: "" });
  const [revalidando, setRevalidando] = useState(false);
  const revalidacaoDias = parseInt(useParametro("terceiro_revalidacao_dias", "45"), 10) || 45;
  const [startJmlOpen, setStartJmlOpen] = useState(false);
  const [atribuirOpen, setAtribuirOpen] = useState(false);
  const [desligarOpen, setDesligarOpen] = useState(false);
  const [desligando, setDesligando] = useState(false);
  const [reativando, setReativando] = useState(false);
  const [selectedPerfil, setSelectedPerfil] = useState("");
  const { data: perfisAcesso } = usePerfisAcesso();
  const { toast } = useToast();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { data: atribuicoes } = useQuery({
    queryKey: ["terceiro_atribuicoes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfil_atribuicoes")
        .select("*, perfis_acesso(nome, tipo)")
        .eq("terceiro_id", id!)
        .eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!terceiro) return <div className="p-8 text-center text-muted-foreground">Terceiro não encontrado.</div>;

  const progress = contractProgress(terceiro.contrato_inicio, terceiro.contrato_fim);
  const dias = diasRestantes(terceiro.contrato_fim);
  const crit = criticidadeConfig[terceiro.criticidade] || { label: terceiro.criticidade, class: "" };

  const sam = (terceiro as any)?.sam_account_name || "";

  const getTerceiroIdentity = () => ({
    id: id!,
    nome: terceiro?.nome || "",
    email: terceiro?.email || null,
    sam_account_name: sam || null,
    tipo: "terceiro" as const,
  });

  const handleAtribuirPerfil = async () => {
    if (!selectedPerfil || !id) return;
    const perfilNome = (perfisAcesso as any[])?.find((p: any) => p.id === selectedPerfil)?.nome || "—";
    const { error } = await supabase.from("perfil_atribuicoes").insert({
      perfil_id: selectedPerfil,
      terceiro_id: id,
      origem: "manual",
      ativo: true,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    // Generate iam_queue for groups/licenses/apps
    await queueFullProfileActions([getTerceiroIdentity()], [selectedPerfil], "assign", undefined);
    // auditoria: trigger perfil_atribuicoes_audit
    toast({ title: "Perfil atribuído", description: `"${perfilNome}" — concessões enviadas ao agente` });
    qc.invalidateQueries({ queryKey: ["terceiro_atribuicoes", id] });
    setAtribuirOpen(false);
    setSelectedPerfil("");
  };

  const handleRevogar = async (atribuicaoId: string, perfilId?: string) => {
    await supabase.from("perfil_atribuicoes").update({ ativo: false, data_revogacao: new Date().toISOString() }).eq("id", atribuicaoId);
    // Generate iam_queue to remove groups/licenses/apps
    if (perfilId) {
      await queueFullProfileActions([getTerceiroIdentity()], [perfilId], "remove", undefined);
    }
    toast({ title: "Perfil revogado", description: "Remoções enviadas ao agente" });
    qc.invalidateQueries({ queryKey: ["terceiro_atribuicoes", id] });
  };

  const handleDesligar = async () => {
    if (!id || !terceiro) return;
    setDesligando(true);
    const res = await desligarTerceiro(
      {
        id,
        nome: terceiro.nome,
        email: terceiro.email || null,
        sam_account_name: sam || null,
        empresa_terceira: terceiro.empresa_terceira || null,
      },
      { email: profile?.email || null, nome: profile?.nome || null },
      atribuicoes || [],
    );
    setDesligando(false);
    setDesligarOpen(false);
    if (!res.success) {
      toast({ title: "Não foi possível desligar", description: res.error, variant: "destructive" });
      return;
    }
    toast({
      title: "Terceiro desligado",
      description: `${res.perfisRevogados ?? 0} perfis revogados e remoções enviadas para processamento.`,
    });
    qc.invalidateQueries({ queryKey: ["terceiro", id] });
    qc.invalidateQueries({ queryKey: ["terceiro_atribuicoes", id] });
  };

  // Revalidação (e renovação opcional do contrato): RPC terceiro_revalidar — registra
  // ultima_revalidacao, auditoria e fecha os alertas de revalidação pendentes
  const handleRevalidar = async () => {
    if (!id) return;
    setRevalidando(true);
    const { data, error } = await supabase.rpc("terceiro_revalidar", { p_terceiro_id: id, p_novo_contrato_fim: renovarForm.novo_fim || null, p_motivo: renovarForm.motivo || null });
    setRevalidando(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || res?.ok === false) { toast({ title: "Erro ao revalidar", description: error?.message || res?.error, variant: "destructive" }); return; }
    toast({ title: "Acesso revalidado", description: renovarForm.novo_fim ? `Contrato renovado até ${new Date(renovarForm.novo_fim + "T12:00:00").toLocaleDateString("pt-BR")}. A conta no AD passa a expirar na nova data.` : `Próxima revalidação em ${revalidacaoDias} dias.` });
    setRenovarOpen(false); setRenovarForm({ novo_fim: "", motivo: "" });
    qc.invalidateQueries({ queryKey: ["terceiro", id] });
    qc.invalidateQueries({ queryKey: ["terceiros"] });
    qc.invalidateQueries({ queryKey: ["alertas"] });
  };

  const handleReativar = async () => {
    if (!id || !terceiro) return;
    setReativando(true);
    const res = await reativarTerceiro(
      {
        id,
        nome: terceiro.nome,
        email: terceiro.email || null,
        sam_account_name: sam || null,
        empresa_terceira: terceiro.empresa_terceira || null,
      },
      { email: profile?.email || null, nome: profile?.nome || null },
    );
    setReativando(false);
    if (!res.success) {
      toast({ title: "Erro ao reativar", description: res.error, variant: "destructive" });
      return;
    }
    toast({
      title: "Terceiro reativado",
      description: `${res.perfisRestaurados ?? 0} perfis e ${res.individuaisRestaurados ?? 0} recursos individuais restaurados.`,
    });
    qc.invalidateQueries({ queryKey: ["terceiro", id] });
    qc.invalidateQueries({ queryKey: ["terceiro_atribuicoes", id] });
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild><Link to="/terceiros"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{terceiro.nome}</h1>
            <Badge variant="outline" className={crit.class}>Criticidade {crit.label}</Badge>
            <Badge variant={terceiro.ativo ? "default" : "secondary"}>{terceiro.ativo ? "Ativo" : "Inativo"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {terceiro.empresa_terceira} · Responsável:{" "}
            {(terceiro as any).responsavel_colaborador ? (
              <Link to={`/colaboradores/${(terceiro as any).responsavel_colaborador.id}`} className="text-primary hover:underline">
                {(terceiro as any).responsavel_colaborador.nome}
              </Link>
            ) : (
              terceiro.responsavel || "—"
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {terceiro.ativo ? (
            <Button variant="destructive" size="sm" onClick={() => setDesligarOpen(true)}>
              <UserX className="mr-1 h-3 w-3" /> Desligar Terceiro
            </Button>
          ) : (
            <Button size="sm" onClick={handleReativar} disabled={reativando}>
              <RotateCcw className="mr-1 h-3 w-3" /> {reativando ? "Reativando..." : "Reativar Terceiro"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setStartJmlOpen(true)}>
            <Workflow className="mr-1 h-3 w-3" /> Iniciar evento JML
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/terceiros?edit=${id}`)}><Pencil className="mr-1 h-3 w-3" /> Editar</Button>
          {terceiro.ativo && <Button size="sm" onClick={() => setRenovarOpen(true)}><ShieldCheck className="mr-1 h-3 w-3" /> Revalidar / Renovar</Button>}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Início: {terceiro.contrato_inicio ? new Date(terceiro.contrato_inicio).toLocaleDateString("pt-BR") : "—"}
            </span>
            <span className={`text-xs font-medium ${dias <= 7 ? "text-destructive" : dias <= 30 ? "text-warning" : "text-muted-foreground"}`}>
              {dias > 0 ? `${dias} dias restantes` : dias === 999 ? "—" : `Vencido há ${Math.abs(dias)} dias`}
            </span>
            <span className="text-xs text-muted-foreground">
              Fim: {terceiro.contrato_fim ? new Date(terceiro.contrato_fim).toLocaleDateString("pt-BR") : "—"}
            </span>
          </div>
          <Progress value={progress} className="h-3" />
        </CardContent>
      </Card>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="contrato">Dados Contrato</TabsTrigger>
          <TabsTrigger value="perfis">Perfis de Acesso ({atribuicoes?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Nome", terceiro.nome],
                  ["Email", terceiro.email || "—"],
                  ["Empresa terceira", terceiro.empresa_terceira || "—"],
                  ["Responsável", (terceiro as any).responsavel_colaborador ? `${(terceiro as any).responsavel_colaborador.nome}${(terceiro as any).responsavel_colaborador.email ? ` (${(terceiro as any).responsavel_colaborador.email})` : ""}` : (terceiro.responsavel || "—")],
                  ["Criticidade", crit.label],
                  ["Login AD", (terceiro as any).sam_account_name || "—"],
                ].map(([label, value]) => (
                  <div key={label as string}><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contrato" className="mt-4 space-y-4">
          <Alert className="border-primary/30 bg-primary/5">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              <strong>Revalidação a cada {revalidacaoDias} dias.</strong> O responsável ({(terceiro as any).responsavel_colaborador?.email || (terceiro as any).responsavel_colaborador?.nome || terceiro.responsavel || "não definido"}) recebe por e-mail um link para <strong>Manter</strong> ou <strong>Desligar</strong> este terceiro; sem resposta até o prazo (parâmetro "Prazo para revalidar terceiros"), o terceiro é desativado automaticamente. Ao vencer o contrato o desligamento também é automático.
              {terceiro.contrato_inicio && (() => {
                const inicio = new Date(terceiro.contrato_inicio!);
                const ultimaRev = (terceiro as any).ultima_revalidacao ? new Date((terceiro as any).ultima_revalidacao) : inicio;
                const proxima = new Date(ultimaRev);
                proxima.setDate(proxima.getDate() + revalidacaoDias);
                return <span className="block mt-1 text-xs text-muted-foreground">Próxima revalidação prevista: <strong>{proxima.toLocaleDateString("pt-BR")}</strong></span>;
              })()}
            </AlertDescription>
          </Alert>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Início contrato", terceiro.contrato_inicio ? new Date(terceiro.contrato_inicio).toLocaleDateString("pt-BR") : "—"],
                  ["Fim contrato", terceiro.contrato_fim ? new Date(terceiro.contrato_fim).toLocaleDateString("pt-BR") : "—"],
                  ["Status", terceiro.ativo ? "Ativo" : "Inativo"],
                  ["Criticidade", crit.label],
                  ["Última revalidação", (terceiro as any).ultima_revalidacao ? new Date((terceiro as any).ultima_revalidacao).toLocaleDateString("pt-BR") : "—"],
                ].map(([label, value]) => (
                  <div key={label as string}><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="perfis" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Perfis de Acesso Atribuídos</h3>
                <Button size="sm" onClick={() => setAtribuirOpen(true)}><Plus className="h-3 w-3 mr-1" /> Atribuir Perfil</Button>
              </div>
              {(atribuicoes || []).length === 0 ? (
                <EmptyState message="Nenhum perfil atribuído." />
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-3 font-medium">Perfil</th>
                    <th className="p-3 font-medium">Tipo</th>
                    <th className="p-3 font-medium">Origem</th>
                    <th className="p-3 font-medium">Concedido em</th>
                    <th className="p-3 font-medium w-16">Ação</th>
                  </tr></thead>
                  <tbody>
                    {(atribuicoes || []).map((a: any) => (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{a.perfis_acesso?.nome || "—"}</td>
                        <td className="p-3"><Badge variant="outline">{humanize(a.perfis_acesso?.tipo)}</Badge></td>
                        <td className="p-3 text-muted-foreground">{humanize(a.origem)}</td>
                        <td className="p-3 text-muted-foreground text-xs">{new Date(a.data_concessao).toLocaleDateString("pt-BR")}</td>
                        <td className="p-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRevogar(a.id, a.perfil_id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={renovarOpen} onOpenChange={setRenovarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revalidar acesso</DialogTitle>
            <DialogDescription>Confirma que {terceiro.nome} ({terceiro.empresa_terceira || "—"}) continua precisando dos acessos atuais. Opcionalmente renove o contrato — a expiração da conta no AD acompanha a nova data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nova data de fim do contrato <span className="text-muted-foreground">(opcional)</span></Label><Input type="date" value={renovarForm.novo_fim} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setRenovarForm({ ...renovarForm, novo_fim: e.target.value })} /><p className="text-xs text-muted-foreground">Atual: {terceiro.contrato_fim ? new Date(terceiro.contrato_fim).toLocaleDateString("pt-BR") : "sem data"}</p></div>
            <div className="space-y-2"><Label>Justificativa</Label><Textarea placeholder="Motivo da revalidação/renovação..." rows={3} value={renovarForm.motivo} onChange={(e) => setRenovarForm({ ...renovarForm, motivo: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenovarOpen(false)}>Cancelar</Button>
            <Button onClick={handleRevalidar} disabled={revalidando}>{revalidando ? "Salvando..." : renovarForm.novo_fim ? "Revalidar e renovar" : "Revalidar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={atribuirOpen} onOpenChange={setAtribuirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Perfil de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={selectedPerfil} onValueChange={setSelectedPerfil}>
                <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
                <SelectContent>
                  {(perfisAcesso || []).filter((p: any) => p.ativo).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome} ({humanize(p.tipo)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtribuirOpen(false)}>Cancelar</Button>
            <Button onClick={handleAtribuirPerfil} disabled={!selectedPerfil}>Atribuir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Desligar Terceiro */}
      <Dialog open={desligarOpen} onOpenChange={setDesligarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desligar Terceiro</DialogTitle>
            <DialogDescription>
              Ao desligar <strong>{terceiro.nome}</strong>, todos os perfis de acesso serão revogados e as remoções de grupos, licenças e aplicativos serão enviadas para processamento no Entra ID.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            <p><strong>Perfis ativos:</strong> {atribuicoes?.length || 0}</p>
            <p><strong>Empresa:</strong> {terceiro.empresa_terceira || "—"}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDesligarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDesligar} disabled={desligando}>
              {desligando ? "Processando..." : "Confirmar Desligamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <StartJmlEventDialog
        open={startJmlOpen}
        onOpenChange={setStartJmlOpen}
        colaboradorId={id}
        colaboradorNome={terceiro.nome}
        allowedTipos={["joiner", "leaver", "pre_leaver"]}
      />
    </div>
  );
}

