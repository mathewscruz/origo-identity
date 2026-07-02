import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { sb, getSupabaseConfig } from "../supabase-client";

function safeMessage(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export default defineTool({
  name: "health_check",
  title: "Diagnóstico MCP",
  description:
    "Diagnóstico read-only do MCP Órigo: valida autenticação, config Supabase e uma consulta mínima sem expor tokens.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
    const result: Record<string, unknown> = {
      authenticated: ctx.isAuthenticated(),
      user_id_present: Boolean(ctx.getUserId()),
      user_email: ctx.getUserEmail() ?? null,
      scopes: ctx.getScopes() ?? null,
      client_id_present: Boolean(ctx.getClientId()),
      claims_keys: Object.keys(ctx.getClaims() ?? {}).sort(),
    };

    try {
      const cfg = getSupabaseConfig();
      result.supabase_url_present = Boolean(cfg.supabaseUrl);
      result.supabase_url_host = new URL(cfg.supabaseUrl).host;
      result.supabase_key_present = Boolean(cfg.supabasePublishableKey);
      result.supabase_key_length = cfg.supabasePublishableKey.length;
    } catch (error) {
      result.config_error = safeMessage(error);
    }

    try {
      const client = sb(ctx);
      const { data: roleData, error: roleError } = await client.rpc("has_role", {
        _user_id: ctx.getUserId(),
        _role: "admin",
      });
      result.has_role_admin = roleError ? null : roleData;
      result.has_role_error = roleError?.message ?? null;

      const { count, error: queryError } = await client
        .from("colaboradores")
        .select("id", { count: "exact", head: true });
      result.colaboradores_count = queryError ? null : count;
      result.colaboradores_error = queryError?.message ?? null;
    } catch (error) {
      result.query_exception = safeMessage(error);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
