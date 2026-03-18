import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, XCircle, Plus } from "lucide-react";
import { useColaborador, usePerfilAtribuicoes, useEventosJML, usePerfisAcesso } from "@/hooks/useOrigoData";
import { provisionCargoAcessos } from "@/lib/provisionCargoAcessos";
import { createEventoJML } from "@/lib/createEventoJML";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", class: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", class: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", class: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

async function disableEntraUser(colaboradorId: string, action: "disable" | "enable") {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/disable-entra-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ colaborador_id: colaboradorId, action }),
  });
  return res.json();
}

const origemColors: Record<string, string> = {
  regra: "bg-primary/15 text-primary border-primary/30",
  excecao: "bg-warning/15 text-warning border-warning/30",
  manual: "bg-muted text-muted-foreground",
  cargo: "bg-info/15 text-info border-info/30",
};

const origemLabels: Record<string, string> = {
  regra: "Regra",
  excecao: "Exceção",
  manual: "Manual",
  cargo: "Cargo",
};

const tipoJMLColors: Record<string, string> = {
  joiner: "bg-success text-success-foreground",
  mover: "bg-info text-info-foreground",
  leaver: "bg-destructive text-destructive-foreground",
};

export default function ColaboradorDetalhePage() {
  const { id } = useParams();
  const { data: pessoa, isLoading } = useColaborador(id);
  const { data: atribuicoes } = usePerfilAtribuicoes(undefined, id);
  const { data: allEventos } = useEventosJML();
  const { data: perfisDisponiveis } = usePerfisAcesso();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [atribuirOpen, setAtribuirOpen] = useState(false);
  const [selectedPerfilId, setSelectedPerfilId] = useState("");
  const [saving, setSaving] = useState(false);

  const eventos = (allEventos ?? []).filter((e) => e.colaborador_id === id);

  async function handleAtribuir() {
    if (!selectedPerfilId || !id) return;
    setSaving(true);
    const { error } = await supabase.from("perfil_atribuicoes").insert({
      perfil_id: selectedPerfilId,
      colaborador_id: id,
      origem: "manual",
    });
    setSaving(false);
    if (error) { toast({ title: "Erro ao atribuir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Perfil atribuído com sucesso" });
    queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
    setAtribuirOpen(false);
    setSelectedPerfilId("");
  }

  async function handleRevogar(atribuicaoId: string) {
    const { error } = await supabase.from("perfil_atribuicoes").update({
      ativo: false,
      data_revogacao: new Date().toISOString(),
    }).eq("id", atribuicaoId);
    if (error) { toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Acesso revogado" });
    queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
  }

  if (isLoading) return <div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!pessoa) return <div className="p-8 text-center text-muted-foreground">Colaborador não encontrado.</div>;

  const cargo = (pessoa.cargos as any)?.nome || "—";
  const area = (pessoa.areas as any)?.nome || "—";
  const empresa = (pessoa.empresas as any)?.nome || "—";
  const localidade = (pessoa.localidades as any)?.nome || "—";
  const gestor = (pessoa.gestor as any)?.nome || "—";
  const sc = statusConfig[pessoa.status] || { label: pessoa.status, class: "" };

  const getPerfilApps = (a: any) => {
    const apps = (a.perfis_acesso as any)?.perfil_aplicacoes;
    if (!apps || !Array.isArray(apps)) return [];
    return apps.map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/colaboradores"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{pessoa.nome}</h1>
            <Badge variant="outline" className={sc.class}>{sc.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{cargo} · {area} · {empresa}</p>
        </div>
        <div className="flex gap-2">
          <Select
            value={pessoa.status}
            onValueChange={async (newStatus) => {
              const oldStatus = pessoa.status;
              const isManual = pessoa.origem === "manual";
              const { error } = await supabase.from("colaboradores").update({ status: newStatus as any }).eq("id", id!);
              if (error) { toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" }); return; }
              
              // If changing FROM ativo to non-ativo → disable in Entra ID
              if (oldStatus === "ativo" && newStatus !== "ativo") {
                toast({ title: "Desativando usuário no Entra ID..." });
                const result = await disableEntraUser(id!, "disable");
                if (result.success) {
                  toast({ title: "Usuário desativado", description: `Entra ID desativado. ${result.atribuicoes_revoked} acessos revogados.` });
                } else {
                  toast({ title: "Aviso", description: `Status alterado mas erro no Entra ID: ${result.error}`, variant: "destructive" });
                }
                // JML leaver event for manual
                if (isManual) {
                  await createEventoJML({
                    colaboradorId: id!,
                    colaboradorNome: pessoa.nome,
                    tipo: "leaver",
                    dadosAntes: { status: oldStatus },
                    dadosDepois: { status: newStatus },
                  });
                }
              }
              // If changing TO ativo → re-enable in Entra ID
              if (oldStatus !== "ativo" && newStatus === "ativo") {
                toast({ title: "Reativando usuário no Entra ID..." });
                const result = await disableEntraUser(id!, "enable");
                if (result.success) {
                  toast({ title: "Usuário reativado no Entra ID" });
                } else {
                  toast({ title: "Aviso", description: `Status alterado mas erro no Entra ID: ${result.error}`, variant: "destructive" });
                }
                // Re-provision cargo access for manual collaborators
                if (isManual && pessoa.cargo_id) {
                  const provResult = await provisionCargoAcessos(id!, pessoa.cargo_id, null);
                  if (provResult.provisioned > 0) {
                    toast({ title: `${provResult.provisioned} acesso(s) re-provisionado(s) do cargo` });
                  }
                }
                // JML joiner event for manual
                if (isManual) {
                  await createEventoJML({
                    colaboradorId: id!,
                    colaboradorNome: pessoa.nome,
                    tipo: "joiner",
                    dadosAntes: { status: oldStatus },
                    dadosDepois: { status: newStatus },
                  });
                }
              }
              
              queryClient.invalidateQueries({ queryKey: ["colaborador", id] });
              queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
              queryClient.invalidateQueries({ queryKey: ["eventos_jml"] });
            }}
          >
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
              <SelectItem value="ferias">Férias</SelectItem>
              <SelectItem value="afastado">Afastado</SelectItem>
              <SelectItem value="desligado">Desligado</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm"><Pencil className="mr-1 h-3 w-3" /> Editar</Button>
        </div>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="acessos">Acessos Ativos ({atribuicoes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="jml">Histórico JML ({eventos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-6">
                {[
                  ["Nome completo", pessoa.nome],
                  ["Email", pessoa.email || "—"],
                  ["CPF", pessoa.cpf || "—"],
                  ["Matrícula", pessoa.matricula || "—"],
                  ["Cargo", cargo],
                  ["Área", area],
                  ["Empresa", empresa],
                  ["Localidade", localidade],
                  ["Gestor", gestor],
                  ["Data admissão", pessoa.data_admissao ? new Date(pessoa.data_admissao).toLocaleDateString("pt-BR") : "—"],
                  ["Origem", pessoa.origem || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acessos" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={() => setAtribuirOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Atribuir Perfil
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-4 font-medium">Perfil</th>
                    <th className="p-4 font-medium">Aplicações</th>
                    <th className="p-4 font-medium">Origem</th>
                    <th className="p-4 font-medium">Desde</th>
                    <th className="p-4 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {(atribuicoes ?? []).map((a) => {
                    const apps = getPerfilApps(a);
                    return (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="p-4 font-medium">{(a.perfis_acesso as any)?.nome || "—"}</td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {apps.length > 0 ? apps.map((name: string) => (
                              <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                            )) : <span className="text-muted-foreground">—</span>}
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={origemColors[a.origem || "manual"]}>
                            {origemLabels[a.origem || "manual"] || a.origem}
                          </Badge>
                        </td>
                        <td className="p-4 text-muted-foreground">{new Date(a.data_concessao).toLocaleDateString("pt-BR")}</td>
                        <td className="p-4">
                          <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => handleRevogar(a.id)}>
                            <XCircle className="mr-1 h-3 w-3" /> Revogar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {(!atribuicoes || atribuicoes.length === 0) && (
                    <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum acesso ativo.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jml" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {eventos.length === 0 ? (
                <p className="text-center text-muted-foreground">Nenhum evento JML.</p>
              ) : (
                <div className="relative border-l-2 border-border pl-6 space-y-6">
                  {eventos.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-card">
                        <div className={`h-2.5 w-2.5 rounded-full ${ev.tipo === "joiner" ? "bg-success" : ev.tipo === "mover" ? "bg-info" : "bg-destructive"}`} />
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${tipoJMLColors[ev.tipo]} text-[10px] uppercase`}>{ev.tipo}</Badge>
                            <Badge variant="outline" className="text-[10px]">{ev.status}</Badge>
                          </div>
                          <p className="text-sm">
                            {ev.dados_depois ? JSON.stringify(ev.dados_depois) : ev.dados_antes ? JSON.stringify(ev.dados_antes) : "Evento processado"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 ml-4">{new Date(ev.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Atribuir Perfil */}
      <Dialog open={atribuirOpen} onOpenChange={setAtribuirOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atribuir Perfil de Acesso</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Perfil de Acesso</Label>
            <Select value={selectedPerfilId} onValueChange={setSelectedPerfilId}>
              <SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger>
              <SelectContent>
                {(perfisDisponiveis ?? []).filter((p: any) => p.ativo).map((p: any) => {
                  const apps = (p.perfil_aplicacoes || []).map((pa: any) => pa.aplicacoes?.nome).filter(Boolean);
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome} {apps.length > 0 ? `(${apps.join(", ")})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtribuirOpen(false)}>Cancelar</Button>
            <Button onClick={handleAtribuir} disabled={saving || !selectedPerfilId}>{saving ? "Salvando..." : "Atribuir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
