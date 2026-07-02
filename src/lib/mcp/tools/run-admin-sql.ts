import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(
    (globalThis as any).process.env.SUPABASE_URL!,
    (globalThis as any).process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "run_admin_sql",
  title: "Executar SQL admin",
  description:
    "Executa uma consulta SELECT arbitrária no banco Postgres do Órigo, retornando as linhas em JSON. Requer papel admin do usuário conectado. Toda execução é gravada na tabela auditoria automaticamente. Use com cautela — não há sandbox.",
  inputSchema: {
    sql: z.string().min(1).describe("SQL a executar. Deve ser uma expressão que retorne linhas (SELECT ... ou CTE terminando em SELECT)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ sql }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("admin_exec_sql", { p_sql: sql });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { rows: data },
    };
  },
});
