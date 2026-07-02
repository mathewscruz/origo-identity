import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb } from "../supabase-client";
import { z } from "zod";


export default defineTool({
  name: "introspect_schema",
  title: "Introspecção do schema",
  description:
    "Retorna metadados do banco: lista de tabelas, colunas, políticas RLS, índices ou funções. Requer papel admin.",
  inputSchema: {
    kind: z.enum(["tables", "columns", "policies", "indexes", "functions"]),
    schema: z.string().optional().describe("Padrão: 'public'"),
    table: z.string().optional().describe("Nome da tabela (para kind=columns/policies/indexes)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ kind, schema, table }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const s = schema ?? "public";
    let sql = "";
    switch (kind) {
      case "tables":
        sql = `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema = ${quote(s)} ORDER BY table_name`;
        break;
      case "columns":
        if (!table) return { content: [{ type: "text", text: "Informe 'table' para kind=columns" }], isError: true };
        sql = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ${quote(s)} AND table_name = ${quote(table)} ORDER BY ordinal_position`;
        break;
      case "policies":
        sql = `SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = ${quote(s)}${table ? ` AND tablename = ${quote(table)}` : ""} ORDER BY tablename, policyname`;
        break;
      case "indexes":
        sql = `SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = ${quote(s)}${table ? ` AND tablename = ${quote(table)}` : ""} ORDER BY tablename, indexname`;
        break;
      case "functions":
        sql = `SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, l.lanname AS language, CASE WHEN p.prosecdef THEN 'security definer' ELSE 'security invoker' END AS security FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang WHERE n.nspname = ${quote(s)} ORDER BY name`;
        break;
    }
    const { data, error } = await sb(ctx).rpc("admin_exec_sql", { p_sql: sql });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { rows: data } };
  },
});

function quote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
