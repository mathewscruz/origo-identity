// Inicia um evento JML e EXECUTA o ciclo de vida correspondente (via RPCs
// transacionais no banco). Usado pelo diálogo "Iniciar evento JML" e pela tool
// MCP `start_jml_event` (Hermes agent).
//
//   leaver               → jml_alterar_status(desligado)
//   joiner               → jml_alterar_status(ativo)           (reativação / recontratação)
//   mover                → jml_alterar_cargo(novoCargoId)      (exige novoCargoId)
//   pre_leaver           → jml_pre_leaver(motivo)
//   pre_leaver_revertido → jml_pre_leaver_reverter(motivo)
import { handlePreflight } from "../_shared/cors.ts";
import { ok, badRequest, notFound, serverError } from "../_shared/respond.ts";
import { requireRole, serviceClient } from "../_shared/auth.ts";

type Tipo = "joiner" | "mover" | "leaver" | "pre_leaver" | "pre_leaver_revertido";
const TIPOS: Tipo[] = ["joiner", "mover", "leaver", "pre_leaver", "pre_leaver_revertido"];

interface Body {
  tipo: Tipo;
  colaboradorId?: string | null;
  colaboradorNome?: string;
  motivo?: string | null;
  novoCargoId?: string | null;
  /** leaver: 'desligado' (padrão) | 'inativo' */
  statusFinal?: "desligado" | "inativo";
  origem?: string;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const auth = await requireRole(req, ["admin", "operador"]);
    if (auth instanceof Response) return auth;

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body?.tipo || !TIPOS.includes(body.tipo)) return badRequest("tipo inválido");
    if (!body.colaboradorId && !body.colaboradorNome) return badRequest("Informe colaboradorId ou colaboradorNome");

    const admin = serviceClient();

    // Resolve o colaborador (id ou nome único)
    let colabId = body.colaboradorId ?? null;
    if (!colabId) {
      const { data: hits } = await admin
        .from("colaboradores")
        .select("id, nome, status")
        .ilike("nome", body.colaboradorNome!.trim())
        .limit(5);
      if (!hits || hits.length === 0) return notFound(`Colaborador "${body.colaboradorNome}" não encontrado`);
      if (hits.length > 1) {
        return badRequest(`Nome ambíguo: ${hits.length} colaboradores chamados "${body.colaboradorNome}". Informe colaboradorId.`, hits);
      }
      colabId = hits[0].id;
    }
    const { data: colab } = await admin.from("colaboradores").select("id, nome, status, cargo_id").eq("id", colabId).maybeSingle();
    if (!colab) return notFound("Colaborador não encontrado");

    const operador = auth.email;
    const origem = body.origem ?? "manual";
    const motivo = body.motivo?.trim() || null;
    let result: Record<string, unknown> | null = null;

    switch (body.tipo) {
      case "leaver": {
        const { data, error } = await admin.rpc("jml_alterar_status", {
          p_colaborador_id: colab.id, p_novo_status: body.statusFinal ?? "desligado",
          p_operador: operador, p_origem: origem, p_motivo: motivo,
        });
        if (error) return serverError(error.message);
        result = data as Record<string, unknown>;
        break;
      }
      case "joiner": {
        const { data, error } = await admin.rpc("jml_alterar_status", {
          p_colaborador_id: colab.id, p_novo_status: "ativo",
          p_operador: operador, p_origem: origem, p_motivo: motivo,
        });
        if (error) return serverError(error.message);
        result = data as Record<string, unknown>;
        break;
      }
      case "mover": {
        if (!body.novoCargoId) return badRequest("mover exige novoCargoId");
        const { data, error } = await admin.rpc("jml_alterar_cargo", {
          p_colaborador_id: colab.id, p_novo_cargo_id: body.novoCargoId,
          p_operador: operador, p_origem: origem,
        });
        if (error) return serverError(error.message);
        result = data as Record<string, unknown>;
        break;
      }
      case "pre_leaver": {
        if (!motivo || motivo.length < 10) return badRequest("pre_leaver exige motivo (mínimo 10 caracteres)");
        const { data, error } = await admin.rpc("jml_pre_leaver", { p_colaborador_id: colab.id, p_motivo: motivo, p_operador: operador });
        if (error) return serverError(error.message);
        result = data as Record<string, unknown>;
        break;
      }
      case "pre_leaver_revertido": {
        if (!motivo || motivo.length < 10) return badRequest("pre_leaver_revertido exige motivo (mínimo 10 caracteres)");
        const { data, error } = await admin.rpc("jml_pre_leaver_reverter", { p_colaborador_id: colab.id, p_motivo: motivo, p_operador: operador });
        if (error) return serverError(error.message);
        result = data as Record<string, unknown>;
        break;
      }
    }

    if (result && result.ok === false) {
      return badRequest(String(result.error ?? "Operação recusada"), result);
    }

    await admin.from("auditoria").insert({
      acao: `jml_${body.tipo}_iniciado`,
      entidade: "colaboradores",
      entidade_id: colab.id,
      operador,
      resumo: `Evento JML ${body.tipo} executado para ${colab.nome}${motivo ? ` — ${motivo}` : ""} (${origem})`,
      detalhes: { tipo: body.tipo, origem, resultado: result },
    });

    return ok({ ok: true, colaboradorId: colab.id, tipo: body.tipo, resultado: result });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
});
