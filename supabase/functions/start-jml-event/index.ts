import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Tipo = "joiner" | "mover" | "leaver" | "pre_leaver" | "pre_leaver_revertido";

interface Body {
  tipo: Tipo;
  colaboradorId?: string | null;
  colaboradorNome: string;
  motivo?: string | null;
  dadosAntes?: Record<string, unknown> | null;
  dadosDepois?: Record<string, unknown> | null;
  origem?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResult, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userResult?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userResult.user;

    const admin = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as Body;
    const allowed: Tipo[] = ["joiner", "mover", "leaver", "pre_leaver", "pre_leaver_revertido"];
    if (!body?.tipo || !allowed.includes(body.tipo) || !body?.colaboradorNome) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dadosDepois = {
      ...(body.dadosDepois ?? {}),
      ...(body.motivo ? { motivo: body.motivo } : {}),
      iniciadoPor: user.email ?? user.id,
    };

    const { data: inserted, error } = await admin
      .from("eventos_jml")
      .insert({
        tipo: body.tipo,
        status: body.tipo === "joiner" || body.tipo === "mover" ? "executando" : "pendente",
        colaborador_id: body.colaboradorId ?? null,
        colaborador_nome: body.colaboradorNome,
        dados_antes: body.dadosAntes ?? null,
        dados_depois: dadosDepois,
        origem: body.origem ?? "manual",
      })
      .select("id")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("auditoria").insert({
      acao: `jml_${body.tipo}_iniciado`,
      entidade: "eventos_jml",
      entidade_id: inserted!.id,
      operador: user.email ?? user.id,
      resumo: `Evento JML ${body.tipo} iniciado manualmente para ${body.colaboradorNome}${body.motivo ? ` — ${body.motivo}` : ""}`,
    });

    return new Response(JSON.stringify({ ok: true, eventoId: inserted!.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
