import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { ok, badRequest, unauthorized, forbidden, serverError } from "../_shared/respond.ts";

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
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return unauthorized("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResult, error: uerr } = await userClient.auth.getUser();
    if (uerr || !userResult?.user) return unauthorized("Invalid token");
    const user = userResult.user;

    // Somente admin/operador podem iniciar eventos JML (a função usa service role).
    let allowed = false;
    for (const role of ["admin", "operador"]) {
      const { data: hasRole } = await userClient.rpc("has_role", { _user_id: user.id, _role: role });
      if (hasRole) { allowed = true; break; }
    }
    if (!allowed) return forbidden("Acesso negado");

    const admin = createClient(supabaseUrl, serviceKey);
    const body = (await req.json()) as Body;
    const allowed: Tipo[] = ["joiner", "mover", "leaver", "pre_leaver", "pre_leaver_revertido"];
    if (!body?.tipo || !allowed.includes(body.tipo) || !body?.colaboradorNome) {
      return badRequest("Invalid payload");
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

    if (error) return serverError(error.message);

    await admin.from("auditoria").insert({
      acao: `jml_${body.tipo}_iniciado`,
      entidade: "eventos_jml",
      entidade_id: inserted!.id,
      operador: user.email ?? user.id,
      resumo: `Evento JML ${body.tipo} iniciado manualmente para ${body.colaboradorNome}${body.motivo ? ` — ${body.motivo}` : ""}`,
    });

    return ok({ ok: true, eventoId: inserted!.id });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
});

// Reference corsHeaders so esbuild keeps it in the bundle for typings clarity.
void corsHeaders;
