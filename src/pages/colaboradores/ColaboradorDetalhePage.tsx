import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, XCircle, Plus } from "lucide-react";
import { useColaborador, usePerfilAtribuicoes, useEventosJML, usePerfisAcesso } from "@/hooks/useOrigoData";
import { provisionCargoAcessos } from "@/lib/provisionCargoAcessos";
import { queueFullProfileActions } from "@/lib/entraQueueHelper";
import { createEventoJML } from "@/lib/createEventoJML";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { triggerEntraProcessing } from "@/lib/triggerEntraProcessing";
import { logAuditoria, logAlerta } from "@/lib/auditLogger";

const statusConfig: Record<string, { label: string; class: string }> = {
  ativo: { label: "Ativo", class: "bg-success/15 text-success border-success/30" },
  inativo: { label: "Inativo", class: "bg-muted text-muted-foreground" },
  ferias: { label: "Férias", class: "bg-info/15 text-info border-info/30" },
  afastado: { label: "Afastado", class: "bg-warning/15 text-warning border-warning/30" },
  desligado: { label: "Desligado", class: "bg-destructive/15 text-destructive border-destructive/30" },
};

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
  const { profile } = useAuth();

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

    // Use central helper to queue Entra ID actions
    const identity = (pessoa as any)?.email || (pessoa as any)?.sam_account_name || "";
    if (identity) {
      const colabIdentity = {
        id: id!,
        nome: pessoa.nome,
        email: pessoa.email || null,
        sam_account_name: (pessoa as any)?.sam_account_name || null,
      };
      await queueFullProfileActions([colabIdentity], [selectedPerfilId], "assign");
    }

    toast({ title: "Perfil atribuído com sucesso" });
    await logAuditoria({ acao: "atribuir_perfil", entidade: "perfil_atribuicoes", entidade_id: id!, resumo: `Perfil atribuído manualmente a ${pessoa.nome}`, operador: profile?.email });
    queryClient.invalidateQueries({ queryKey: ["perfil_atribuicoes"] });
    setAtribuirOpen(false);
    setSelectedPerfilId("");
  }

  async function handleRevogar(atribuicaoId: string, perfilId?: string) {
    const { error } = await supabase.from("perfil_atribuicoes").update({
      ativo: false,
      data_revogacao: new Date().toISOString(),
    }).eq("id", atribuicaoId);
    if (error) { toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" }); return; }

    // Use central helper to queue Entra ID removal actions
    const identity = (pessoa as any)?.email || (pessoa as any)?.sam_account_name || "";
    if (identity && perfilId) {
      const colabIdentity = {
        id: id!,
        nome: pessoa.nome,
        email: pessoa.email || null,
        sam_account_name: (pessoa as any)?.sam_account_name || null,
      };
      await queueFullProfileActions([colabIdentity], [perfilId], "remove");
    }

    toast({ title: "Acesso revogado" });
    await logAuditoria({ acao: "revogar_perfil", entidade: "perfil_atribuicoes", entidade_id: id!, resumo: `Perfil revogado de ${pessoa.nome}`, operador: profile?.email });
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
              const sam = (pessoa as any)?.sam_account_name || "";
              const { error } = await supabase.from("colaboradores").update({ status: newStatus as any }).eq("id", id!);
              if (error) { toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" }); return; }
              await logAuditoria({ acao: "alterar_status_colaborador", entidade: "colaboradores", entidade_id: id!, resumo: `Status: ${oldStatus} → ${newStatus} — ${pessoa.nome}`, operador: profile?.email });
              if (oldStatus === "ativo" && newStatus !== "ativo") {
                await logAlerta({ titulo: "Colaborador desabilitado", mensagem: `${pessoa.nome} teve o status alterado para ${newStatus}`, severidade: "aviso", tipo: "colaborador_desabilitado", ref_url: `/colaboradores/${id}` });
              }
              
              // Queue disable request
              if (oldStatus === "ativo" && newStatus !== "ativo") {
                // 1. Disable in AD local
                await supabase.from("iam_queue" as any).insert({
                  action_type: "disable",
                  payload_json: {
                    samAccountName: sam,
                    mail: pessoa.email || null,
                    displayName: pessoa.nome,
                    status: "disabled",
                    status_anterior: oldStatus,
                    status_novo: newStatus,
                    changed_fields: ["status"],
                    new_values: { status: "disabled" },
                  },
                  requested_by: profile?.email || "sistema",
                  colaborador_id: id,
                  target_identity: sam || null,
                });

                // 2. Remove all Entra ID groups/licenses/apps from active profiles
                const { data: activeAtribuicoes } = await supabase
                  .from("perfil_atribuicoes")
                  .select("perfil_id")
                  .eq("colaborador_id", id!)
                  .eq("ativo", true);
                const activePerfilIds = (activeAtribuicoes ?? []).map((a: any) => a.perfil_id).filter(Boolean);
                if (activePerfilIds.length > 0 && (pessoa.email || sam)) {
                  const colabIdentity = {
                    id: id!,
                    nome: pessoa.nome,
                    email: pessoa.email || null,
                    sam_account_name: sam || null,
                  };
                  await queueFullProfileActions([colabIdentity], activePerfilIds, "remove", { triggerImmediately: false });
                }

                // 3. Disable Entra ID account
                if (pessoa.email || sam) {
                  await supabase.from("iam_queue" as any).insert({
                    action_type: "disable_entra",
                    payload_json: {
                      mail: pessoa.email || null,
                      samAccountName: sam,
                      displayName: pessoa.nome,
                    },
                    requested_by: profile?.email || "sistema",
                    colaborador_id: id,
                    target_identity: pessoa.email || sam || null,
                  });
                }

                toast({ title: "Solicitação de desativação enviada para processamento" });

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

              // Queue enable request
              if (oldStatus !== "ativo" && newStatus === "ativo") {
                // 1. Enable in AD local
                await supabase.from("iam_queue" as any).insert({
                  action_type: "update",
                  payload_json: {
                    samAccountName: sam,
                    mail: pessoa.email || null,
                    displayName: pessoa.nome,
                    status: "enabled",
                    status_anterior: oldStatus,
                    status_novo: "ativo",
                    changed_fields: ["status"],
                    new_values: { status: "enabled" },
                  },
                  requested_by: profile?.email || "sistema",
                  colaborador_id: id,
                  target_identity: sam || null,
                });

                // 2. Enable Entra ID account
                if (pessoa.email || sam) {
                  await supabase.from("iam_queue" as any).insert({
                    action_type: "enable_entra",
                    payload_json: {
                      mail: pessoa.email || null,
                      samAccountName: sam,
                      displayName: pessoa.nome,
                    },
                    requested_by: profile?.email || "sistema",
                    colaborador_id: id,
                    target_identity: pessoa.email || sam || null,
                  });
                }

                toast({ title: "Solicitação de reativação enviada para processamento" });

                // 3. Re-provision cargo-based access profiles
                if (isManual && pessoa.cargo_id) {
                  await provisionCargoAcessos(id!, pessoa.cargo_id, null);
                }
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
              triggerEntraProcessing();
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
                          <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => handleRevogar(a.id, a.perfil_id)}>
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
