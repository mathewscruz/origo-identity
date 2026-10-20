// Assistente "Conectar sistema": conversa por streaming e preenche a ficha da aplicação via ferramentas.
// Credenciais NUNCA passam pela IA — são gravadas só pelo formulário protegido.
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "npm:ai";
import { z } from "npm:zod@3";
import { requireRole } from "../_shared/auth.ts";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "../_shared/run-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lovable-aig-run-id",
  "Access-Control-Expose-Headers": "X-Lovable-AIG-Run-ID",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const INSTRUCTIONS = `Você é o assistente de conexão de sistemas do Órigo IAM (governança de identidades da Órigo Energia). Fale em português do Brasil, de forma curta e objetiva.
Objetivo: montar a ficha de um sistema para que o Hermes Agent consiga dar e retirar acesso das pessoas.
Campos da ficha: nome, url, descricao, dono (colaborador), revisor (colaborador), modo_acesso e os dados do modo:
- "grupo": o acesso vem de estar num grupo do AD/Entra. Use buscar_grupo para achar o grupo e grave grupo_id.
- "api": o sistema tem API. Grave api_base_url, api_auth_type (bearer, api_key, basic, oauth2_client_credentials) e api_docs (resumo do que o usuário colou). NUNCA peça nem aceite senhas/chaves no chat: diga para digitar no campo protegido "Credencial" ao lado.
- "manual": não há integração. Grave instrucoes_acesso (passo a passo para dar acesso) e instrucoes_revogacao.
  No modo "api" registre também, com atualizar_acoes_api, como CRIAR, DESATIVAR e CONSULTAR o usuário: método HTTP, caminho (relativo ao endereço) e corpo JSON. Use os marcadores {{nome}}, {{email}}, {{matricula}}, {{login}} e {{perfil_externo}}. Ex.: create = POST /users com {"name":"{{nome}}","email":"{{email}}"}; disable = PATCH /users/{{email}} com {"active":false}; lookup = GET /users/{{email}}.
Também colete perfis_internos (papéis do sistema, ex.: Leitor, Aprovador) quando existirem.
Último passo: pergunte quais perfis de acesso (que agrupam cargos) devem receber o sistema. Use buscar_perfil_acesso e ligar_perfis; se o sistema tiver papéis, pergunte qual papel cada perfil recebe.
Use buscar_colaborador para dono e revisor (sempre confirme o nome encontrado). Chame atualizar_ficha sempre que aprender algo novo — não espere o fim.
Quando o usuário colar um link (site, manual, Swagger/OpenAPI) ou disser que anexou um arquivo, chame pedir_analise_hermes: quem lê e analisa o material é SEMPRE o Hermes — você não lê links. Diga que o diagnóstico vai aparecer num cartão "Aplicar na ficha" em alguns minutos e continue a conversa. Se "analise_hermes" na ficha tiver um diagnóstico, use-o para orientar as próximas perguntas.
Faça uma pergunta por vez. Quando a ficha estiver completa, diga que o usuário pode clicar em "Salvar e ativar" e que o Hermes vai testar a conexão.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireRole(req, ["admin", "operador", "platform_admin"]);
  if (auth instanceof Response) return new Response(auth.body, { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "Assistente sem configuração de IA" }, 500);

  let body: { aplicacaoId?: string; messages?: UIMessage[] };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const aplicacaoId = body.aplicacaoId;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!aplicacaoId || !/^[0-9a-f-]{36}$/i.test(aplicacaoId)) return json({ error: "aplicacaoId inválido" }, 400);
  if (!messages.length) return json({ error: "messages vazio" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: app, error: appErr } = await sb.from("aplicacoes").select("*").eq("id", aplicacaoId).maybeSingle();
  if (appErr || !app) return json({ error: "Aplicação não encontrada" }, 404);

  const { data: conn } = await sb.from("aplicacao_connectors").select("config").eq("aplicacao_id", aplicacaoId).maybeSingle();
  const { data: perfis } = await sb.from("aplicacao_perfis_internos").select("nome_externo").eq("aplicacao_id", aplicacaoId);
  // deno-lint-ignore no-explicit-any
  const cfg: any = conn?.config ?? {};
  const fichaAtual = {
    nome: app.nome, url: app.url, descricao: app.descricao, modo_acesso: app.modo_acesso, grupo_id: app.grupo_id,
    owner_colaborador_id: app.owner_colaborador_id, revisor_colaborador_id: app.revisor_colaborador_id,
    instrucoes_acesso: app.instrucoes_acesso, instrucoes_revogacao: app.instrucoes_revogacao,
    api_base_url: cfg.base_url ?? null, api_auth_type: cfg.auth_type ?? null, credencial_salva: !!(cfg.api_token || cfg.api_key_value || cfg.password || cfg.oauth_client_secret),
    perfis_internos: (perfis ?? []).map((p) => p.nome_externo),
    analise_hermes: null as unknown,
    api_acoes: { create: !!cfg.actions?.create, disable: !!cfg.actions?.disable, lookup: !!cfg.actions?.lookup },
  };

  const { data: ultAnalise } = await sb.from("agent_tasks").select("status, result, result_json, created_at").eq("task", "analyze-app-docs")
    .eq("payload->>aplicacao_id", aplicacaoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (ultAnalise) fichaAtual.analise_hermes = ultAnalise;

  const tools = {
    pedir_analise_hermes: tool({
      description: "Pede ao Hermes para ler e analisar um link de documentação/site do sistema e sugerir a forma de conexão, ações da API e perfis.",
      inputSchema: z.object({ url: z.string().url().max(1000), observacao: z.string().max(1000).nullable() }),
      execute: async ({ url, observacao }) => {
        const { data, error } = await sb.rpc("app_analise_solicitar", { p_aplicacao_id: aplicacaoId, p_url: url, p_observacao: observacao });
        if (error) return { ok: false, error: error.message };
        return { ok: true, pedido: data, aviso: "O Hermes vai analisar e o diagnóstico aparece no cartão 'Aplicar na ficha'." };
      },
    }),
    atualizar_acoes_api: tool({
      description: "Grava como criar, desativar e consultar o usuário no sistema por API.",
      inputSchema: z.object({
        acao: z.enum(["create", "disable", "lookup"]),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().min(1).max(300),
        body_template: z.string().max(2000).nullable(),
      }),
      execute: async ({ acao, method, path, body_template }) => {
        if (body_template) { try { JSON.parse(body_template.replace(/\{\{\s*\w+\s*\}\}/g, "x")); } catch { return { ok: false, error: "O corpo precisa ser JSON válido" }; } }
        const next = { ...cfg, actions: { ...(cfg.actions ?? {}), [acao]: { method, path, body_template } } };
        const { error } = await sb.from("aplicacao_connectors").upsert({ aplicacao_id: aplicacaoId, config: next, updated_at: new Date().toISOString() });
        if (error) return { ok: false, error: error.message };
        Object.assign(cfg, next);
        await sb.from("aplicacoes").update({ teste_status: "pendente" }).eq("id", aplicacaoId);
        return { ok: true };
      },
    }),
    buscar_perfil_acesso: tool({
      description: "Busca perfis de acesso (que são ligados aos cargos) pelo nome.",
      inputSchema: z.object({ termo: z.string().min(2) }),
      execute: async ({ termo }) => {
        const { data } = await sb.from("perfis_acesso").select("id, nome, descricao").eq("ativo", true).ilike("nome", `%${termo}%`).limit(10);
        return data ?? [];
      },
    }),
    ligar_perfis: tool({
      description: "Liga o sistema a perfis de acesso, para que os cargos desses perfis recebam o acesso. Opcionalmente informa o papel interno.",
      inputSchema: z.object({ ligacoes: z.array(z.object({ perfil_id: z.string(), papel_interno: z.string().nullable() })).min(1).max(20) }),
      execute: async ({ ligacoes }) => {
        const out: string[] = [];
        for (const l of ligacoes) {
          const { data: ja } = await sb.from("perfil_aplicacoes").select("id").eq("perfil_id", l.perfil_id).eq("aplicacao_id", aplicacaoId).maybeSingle();
          if (!ja) { const { error } = await sb.from("perfil_aplicacoes").insert({ perfil_id: l.perfil_id, aplicacao_id: aplicacaoId }); if (error) return { ok: false, error: error.message }; }
          if (l.papel_interno) {
            const { data: pi } = await sb.from("aplicacao_perfis_internos").select("id").eq("aplicacao_id", aplicacaoId).ilike("nome_externo", l.papel_interno).maybeSingle();
            if (pi) {
              await sb.from("perfil_apps_internos").delete().eq("perfil_id", l.perfil_id).eq("aplicacao_id", aplicacaoId);
              await sb.from("perfil_apps_internos").insert({ perfil_id: l.perfil_id, aplicacao_id: aplicacaoId, perfil_interno_id: pi.id });
            }
          }
          out.push(l.perfil_id);
        }
        await sb.from("auditoria").insert({ acao: "ligar_perfil_aplicacao", entidade: "aplicacoes", entidade_id: aplicacaoId, operador: auth.userId ?? null, resumo: `${app.nome} ligado a ${out.length} perfil(is) pelo assistente` });
        return { ok: true, ligados: out.length, aviso: "Pessoas desses cargos recebem o acesso quando o sistema estiver ativo." };
      },
    }),
    buscar_grupo: tool({
      description: "Busca grupos do AD/Entra pelo nome.",
      inputSchema: z.object({ termo: z.string().min(2) }),
      execute: async ({ termo }) => {
        const { data } = await sb.from("entra_grupos").select("id, nome, on_premises_sync").ilike("nome", `%${termo}%`).limit(10);
        return (data ?? []).map((g) => ({ id: g.id, nome: g.nome, origem: g.on_premises_sync ? "AD" : "Entra" }));
      },
    }),
    buscar_colaborador: tool({
      description: "Busca colaboradores ativos pelo nome ou e-mail.",
      inputSchema: z.object({ termo: z.string().min(2) }),
      execute: async ({ termo }) => {
        const { data } = await sb.from("colaboradores").select("id, nome, email").neq("status", "desligado")
          .or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`).limit(8);
        return data ?? [];
      },
    }),
    atualizar_ficha: tool({
      description: "Atualiza campos da ficha do sistema. Envie só os campos que mudaram (os outros como null).",
      inputSchema: z.object({
        nome: z.string().nullable(), url: z.string().nullable(), descricao: z.string().nullable(),
        modo_acesso: z.enum(["grupo", "api", "manual", "sso"]).nullable(),
        grupo_id: z.string().nullable(), owner_colaborador_id: z.string().nullable(), revisor_colaborador_id: z.string().nullable(),
        instrucoes_acesso: z.string().nullable(), instrucoes_revogacao: z.string().nullable(),
        api_base_url: z.string().nullable(), api_auth_type: z.string().nullable(), api_docs: z.string().nullable(),
        perfis_internos: z.array(z.string()).nullable(),
      }),
      execute: async (f) => {
        const upd: Record<string, unknown> = {};
        for (const k of ["nome", "url", "descricao", "modo_acesso", "grupo_id", "owner_colaborador_id", "revisor_colaborador_id", "instrucoes_acesso", "instrucoes_revogacao"] as const) {
          if (f[k] !== null && f[k] !== undefined) upd[k] = f[k];
        }
        if (upd.owner_colaborador_id) {
          const { data: o } = await sb.from("colaboradores").select("nome").eq("id", upd.owner_colaborador_id as string).maybeSingle();
          if (o) upd.owner = o.nome;
        }
        if (Object.keys(upd).length) {
          upd.teste_status = "pendente";
          const { error } = await sb.from("aplicacoes").update(upd).eq("id", aplicacaoId);
          if (error) return { ok: false, error: error.message };
        }
        if (f.api_base_url || f.api_auth_type || f.api_docs) {
          const next = { ...cfg, ...(f.api_base_url ? { base_url: f.api_base_url } : {}), ...(f.api_auth_type ? { auth_type: f.api_auth_type } : {}), ...(f.api_docs ? { docs: f.api_docs } : {}) };
          const { error } = await sb.from("aplicacao_connectors").upsert({ aplicacao_id: aplicacaoId, config: next, updated_at: new Date().toISOString() });
          if (error) return { ok: false, error: error.message };
          Object.assign(cfg, next);
        }
        if (f.perfis_internos?.length) {
          const existentes = new Set(fichaAtual.perfis_internos.map((n) => n.toLowerCase()));
          const novos = f.perfis_internos.filter((n) => n.trim() && !existentes.has(n.toLowerCase()));
          if (novos.length) await sb.from("aplicacao_perfis_internos").insert(novos.map((n) => ({ aplicacao_id: aplicacaoId, nome_externo: n.trim() })));
        }
        return { ok: true };
      },
    }),
  };

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(req));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: `${INSTRUCTIONS}\n\nFicha atual (JSON): ${JSON.stringify(fichaAtual)}`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(10),
    abortSignal: req.signal,
    providerOptions: {
      openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
    },
  // deno-lint-ignore no-explicit-any
  } as any);

  const res = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    headers: corsHeaders,
    onFinish: async ({ messages: all }) => {
      const rows = all.map((m) => ({ aplicacao_id: aplicacaoId, msg_id: m.id, role: m.role, message: m, autor: auth.userId ?? null }));
      const { error } = await sb.from("aplicacao_chat_mensagens").upsert(rows, { onConflict: "aplicacao_id,msg_id" });
      if (error) console.error("[app-connect-assistant] salvar conversa:", error.message);
    },
  });
  return withLovableAiGatewayRunIdHeader(res, runIdFetch, corsHeaders);
});
