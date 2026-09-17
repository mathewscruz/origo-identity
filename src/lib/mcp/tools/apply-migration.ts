import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";


export default defineTool({
  name: "apply_migration",
  title: "Aplicar migração (DDL)",
  description:
    "Executa comandos DDL/DML arbitrários (CREATE/ALTER TABLE, políticas RLS, funções, triggers, INSERT/UPDATE/DELETE em qualquer tabela). Requer papel platform_admin. Sempre inclua GRANTs após CREATE TABLE em schema public, ENABLE RLS e CREATE POLICY (padrão obrigatório do projeto). Toda execução é auditada.",
  inputSchema: {
    sql: z.string().min(1).describe("SQL DDL/DML completo. Pode conter múltiplas statements separadas por ';'."),
    description: z.string().min(3).describe("Descrição curta e clara do que a migração faz (para a auditoria)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ sql, description }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const { data, error } = await sb(ctx).rpc("admin_exec_ddl", { p_sql: sql, p_description: description });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `ok — ${description}` }],
      structuredContent: { ok: true, result: data },
    };
  },
});
