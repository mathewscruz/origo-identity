import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowLeft, Cable, CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import ColaboradorPicker from "@/components/ColaboradorPicker";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { MODOS_ACESSO, fichaPendencias, type ModoAcesso } from "@/lib/appConnect";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/app-connect-assistant`;

/** /aplicacoes/conectar — cria o rascunho e abre a conversa dele. */
export function NovoSistemaRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    let done = false;
    (async () => {
      const { data, error } = await supabase.from("aplicacoes").insert({ nome: "Novo sistema", origem: "manual", modo_acesso: "manual", criticidade: "media" } as Row).select("id").single();
      if (done) return;
      if (error) { toast.error("Não foi possível iniciar a conexão", { description: error.message }); navigate("/aplicacoes"); return; }
      navigate(`/aplicacoes/${data.id}/conectar`, { replace: true });
    })();
    return () => { done = true; };
  }, [navigate]);
  return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Preparando…</div>;
}

export default function ConectarSistemaPage() {
  const { id } = useParams<{ id: string }>();
  const { data: historico, isLoading } = useQuery({
    queryKey: ["aplicacao_chat", id],
    queryFn: async () => {
      const { data, error } = await (supabase as Row).from("aplicacao_chat_mensagens").select("message").eq("aplicacao_id", id).order("created_at");
      if (error) throw error;
      return (data ?? []).map((r: Row) => r.message as UIMessage);
    },
    enabled: !!id,
  });
  if (!id || isLoading) return <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;
  return <ConectarSistema key={id} id={id} initial={historico ?? []} />;
}

function ConectarSistema({ id, initial }: { id: string; initial: UIMessage[] }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: app, refetch } = useQuery({
    queryKey: ["aplicacao_conectar", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("aplicacoes").select("*, grupo:entra_grupos(nome), connector:aplicacao_connectors(config)").eq("id", id).single();
      if (error) throw error;
      return data as Row;
    },
  });
  const { data: perfis } = useQuery({
    queryKey: ["aplicacao_perfis_internos", id],
    queryFn: async () => (await supabase.from("aplicacao_perfis_internos").select("id, nome_externo").eq("aplicacao_id", id)).data ?? [],
  });

  const transport = useMemo(() => new DefaultChatTransport({
    api: FN_URL,
    headers: async () => {
      const { data } = await supabase.auth.getSession();
      return { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${data.session?.access_token ?? ""}` };
    },
    body: { aplicacaoId: id },
  }), [id]);

  const { messages, sendMessage, status, stop } = useChat({
    id, messages: initial, transport,
    onError: (e) => toast.error("O assistente não respondeu", { description: e.message.includes("402") ? "Créditos de IA esgotados." : e.message.includes("429") ? "Muitas mensagens seguidas; aguarde um pouco." : e.message }),
    onFinish: () => { refetch(); qc.invalidateQueries({ queryKey: ["aplicacao_perfis_internos", id] }); },
  });
  const busy = status === "submitted" || status === "streaming";

  const save = async (patch: Record<string, unknown>) => {
    const { error } = await supabase.from("aplicacoes").update({ ...patch, teste_status: "pendente" } as Row).eq("id", id);
    if (error) toast.error("Não foi possível salvar", { description: error.message }); else refetch();
  };

  const ativar = async () => {
    await save({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)("agent_refresh_request", { p_task: "test-app-connection", p_min_interval_min: 1 });
    if (error) toast.error("Não foi possível pedir o teste ao Hermes", { description: error.message });
    else toast.success("Ficha salva. O Hermes vai testar a conexão no próximo ciclo.");
  };

  const pend = app ? fichaPendencias({ ...app, api_base_url: app.connector?.config?.base_url ?? app.connector?.[0]?.config?.base_url }) : [];
  const modo = (app?.modo_acesso ?? "manual") as ModoAcesso;

  return (
    <div className="space-y-4">
      <PageHeader
        title={app?.nome && app.nome !== "Novo sistema" ? `Conectar: ${app.nome}` : "Conectar sistema"}
        description="Descreva o sistema do seu jeito — link, documentação, grupo ou passo a passo. O assistente monta a ficha e o Hermes testa e executa."
        leading={<Button variant="ghost" size="icon" onClick={() => navigate("/aplicacoes")} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Button>}
      />
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Conversa */}
        <Card className="flex h-[calc(100vh-14rem)] min-h-[520px] flex-col lg:col-span-3">
          <Conversation className="flex-1">
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState icon={<Cable className="h-8 w-8" />} title="Qual sistema você quer conectar?" description='Ex.: "GLPI — o acesso é pelo grupo GLPI-Usuarios do AD" ou cole o link da documentação da API.' />
              ) : messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {m.parts.map((p: Row, i: number) => {
                      if (p.type === "text") return <MessageResponse key={i}>{p.text}</MessageResponse>;
                      if (typeof p.type === "string" && p.type.startsWith("tool-")) {
                        const nome = p.type.replace("tool-", "");
                        const titulo = nome === "atualizar_ficha" ? "Atualizou a ficha" : nome === "buscar_grupo" ? "Buscou grupos" : nome === "buscar_colaborador" ? "Buscou colaboradores" : nome;
                        return (
                          <Tool key={i} defaultOpen={false}>
                            <ToolHeader type={p.type} state={p.state} title={titulo} />
                            <ToolContent><ToolInput input={p.input} /><ToolOutput output={p.output} errorText={p.errorText} /></ToolContent>
                          </Tool>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))}
              {status === "submitted" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Pensando…</p>}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="border-t p-3">
            <PromptInput onSubmit={({ text }) => { if (text.trim() && !busy) sendMessage({ text }); }}>
              <PromptInputTextarea autoFocus placeholder="Escreva aqui… (nunca cole senhas ou chaves)" />
              <PromptInputFooter className="justify-end">
                <PromptInputSubmit status={status} onStop={stop} />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </Card>

        {/* Ficha */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Ficha do sistema</CardTitle>
              {app?.teste_status === "ok" && <Badge variant="outline" className="border-success/30 bg-success/10 text-success"><CheckCircle2 className="mr-1 h-3 w-3" />Conectado</Badge>}
              {app?.teste_status === "erro" && <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive"><XCircle className="mr-1 h-3 w-3" />Falhou</Badge>}
              {app?.teste_status === "pendente" && <Badge variant="outline">Aguardando teste do Hermes</Badge>}
            </div>
            {app?.teste_detalhe && <p className="text-xs text-muted-foreground">{app.teste_detalhe}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            {!app ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <>
                <Campo label="Nome"><Input defaultValue={app.nome} key={`n${app.nome}`} onBlur={(e) => e.target.value !== app.nome && save({ nome: e.target.value })} /></Campo>
                <Campo label="Link"><Input defaultValue={app.url ?? ""} key={`u${app.url}`} placeholder="https://" onBlur={(e) => e.target.value !== (app.url ?? "") && save({ url: e.target.value || null })} /></Campo>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Dono"><ColaboradorPicker value={app.owner_colaborador_id} onChange={(c) => save({ owner_colaborador_id: c?.id ?? null, owner: c?.nome ?? null })} /></Campo>
                  <Campo label="Revisor"><ColaboradorPicker value={app.revisor_colaborador_id} onChange={(c) => save({ revisor_colaborador_id: c?.id ?? null })} /></Campo>
                </div>
                <Campo label="Forma de acesso">
                  <div className="grid grid-cols-3 gap-2">
                    {MODOS_ACESSO.map((m) => (
                      <button key={m.value} type="button" onClick={() => save({ modo_acesso: m.value })} className={`rounded-md border p-2 text-left text-xs transition-colors ${modo === m.value ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                        <span className="block font-medium">{m.label}</span><span className="text-muted-foreground">{m.hint}</span>
                      </button>
                    ))}
                  </div>
                </Campo>
                {modo === "grupo" && <Campo label="Grupo que dá acesso"><p className="text-sm">{app.grupo?.nome ?? <span className="text-muted-foreground">Diga ao assistente o nome do grupo</span>}</p></Campo>}
                {modo === "api" && (
                  <Campo label="API">
                    <p className="text-sm">{app.connector?.config?.base_url ?? app.connector?.[0]?.config?.base_url ?? <span className="text-muted-foreground">Informe o endereço ao assistente</span>}</p>
                    <Button asChild variant="outline" size="sm" className="mt-2"><Link to={`/aplicacoes/${id}?tab=conector`}><KeyRound className="mr-1 h-4 w-4" />Credencial (campo protegido)</Link></Button>
                  </Campo>
                )}
                {modo === "manual" && (
                  <>
                    <Campo label="Como dar acesso"><Textarea rows={3} defaultValue={app.instrucoes_acesso ?? ""} key={`i${app.instrucoes_acesso}`} onBlur={(e) => save({ instrucoes_acesso: e.target.value || null })} /></Campo>
                    <Campo label="Como retirar acesso"><Textarea rows={2} defaultValue={app.instrucoes_revogacao ?? ""} key={`r${app.instrucoes_revogacao}`} onBlur={(e) => save({ instrucoes_revogacao: e.target.value || null })} /></Campo>
                  </>
                )}
                <Campo label="Perfis internos">
                  <div className="flex flex-wrap gap-1">{(perfis ?? []).length ? (perfis ?? []).map((p: Row) => <Badge key={p.id} variant="secondary">{p.nome_externo}</Badge>) : <span className="text-xs text-muted-foreground">Nenhum (acesso único)</span>}</div>
                </Campo>
                {pend.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-xs text-warning">{pend.map((p) => <li key={p}>{p}</li>)}</ul>}
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1" disabled={pend.length > 0 || busy} onClick={ativar}>Salvar e ativar</Button>
                  <Button variant="outline" asChild><Link to={`/aplicacoes/${id}`}>Abrir aplicação</Link></Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Depois de ativo, ligue o sistema a um Perfil de Acesso para que os cargos recebam o acesso automaticamente.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
