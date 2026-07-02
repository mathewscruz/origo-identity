import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";


export default defineTool({
  name: "get_colaborador",
  title: "Detalhes do colaborador",
  description:
    "Retorna detalhes completos de um colaborador (por id, email ou employ_id), incluindo perfis atribuídos, últimos eventos JML e itens abertos na fila IAM.",
  inputSchema: {
    id: z.string().uuid().optional(),
    email: z.string().email().optional(),
    employ_id: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const client = sb(ctx);
    let q = client.from("colaboradores").select("*").limit(1);
    if (input.id) q = q.eq("id", input.id);
    else if (input.email) q = q.eq("email", input.email);
    else if (input.employ_id) q = q.eq("employ_id", input.employ_id);
    else return { content: [{ type: "text", text: "Informe id, email ou employ_id." }], isError: true };
    const { data: colab, error } = await q.maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!colab) return { content: [{ type: "text", text: "Colaborador não encontrado." }], isError: true };

    const [{ data: perfis }, { data: eventos }, { data: fila }] = await Promise.all([
      client.from("perfil_atribuicoes").select("*").eq("colaborador_id", colab.id),
      client.from("eventos_jml").select("*").eq("colaborador_id", colab.id).order("created_at", { ascending: false }).limit(10),
      client.from("iam_queue").select("*").eq("colaborador_id", colab.id).in("status", ["pending", "waiting_approval", "processing"]).order("created_at", { ascending: false }).limit(50),
    ]);

    return {
      content: [{ type: "text", text: JSON.stringify({ colaborador: colab, perfis, eventos_jml: eventos, iam_queue_abertos: fila }) }],
      structuredContent: { colaborador: colab, perfis, eventos_jml: eventos, iam_queue_abertos: fila },
    };
  },
});
