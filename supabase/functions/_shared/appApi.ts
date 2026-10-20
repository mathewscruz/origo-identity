// Execução das ações de um sistema conectado por API (criar / desativar / consultar usuário).
// Puro TS (sem Deno.*) para ser testável no vitest. Credenciais ficam só no servidor.

export type AppApiAction = { method: string; path: string; body_template?: string | null };
export type AppApiActions = { create?: AppApiAction | null; disable?: AppApiAction | null; lookup?: AppApiAction | null };
export type AppApiVars = { nome?: string | null; email?: string | null; matricula?: string | null; perfil_externo?: string | null; login?: string | null };

/** Troca {{campo}} pelos dados da pessoa. Em JSON, os valores são escapados. */
export function renderTemplate(tpl: string, vars: AppApiVars, json = false): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => {
    const v = (vars as Record<string, string | null | undefined>)[k] ?? "";
    return json ? JSON.stringify(String(v)).slice(1, -1) : encodeURIComponent(String(v));
  });
}

// deno-lint-ignore no-explicit-any
export function authHeaders(c: any): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (c.auth_type === "bearer" && c.api_token) h.Authorization = `Bearer ${c.api_token}`;
  if (c.auth_type === "basic") h.Authorization = `Basic ${btoa(`${c.username || ""}:${c.password || ""}`)}`;
  if (c.auth_type === "api_key" && c.api_key_header && c.api_key_value) h[c.api_key_header] = c.api_key_value;
  if (c.auth_type === "app_token") { if (c.app_token) h["App-Token"] = c.app_token; if (c.session_token) h["Session-Token"] = c.session_token; }
  return h;
}

export type AppApiResult = { status: "success" | "failed" | "pending"; error_code?: string; result_message: string; http_status?: number };

/** Executa uma ação. execute=false só mostra o que seria feito. */
// deno-lint-ignore no-explicit-any
export async function runAppAction(cfg: any, kind: keyof AppApiActions, vars: AppApiVars, execute: boolean): Promise<AppApiResult> {
  const a: AppApiAction | null | undefined = cfg?.actions?.[kind];
  if (!cfg?.base_url) return { status: "failed", error_code: "app_api_not_configured", result_message: "Falta o endereço da API na ficha do sistema." };
  if (!a?.path) return { status: "failed", error_code: "app_api_action_missing", result_message: `A ficha não diz como ${kind === "create" ? "criar" : kind === "disable" ? "desativar" : "consultar"} o usuário.` };
  const url = cfg.base_url.replace(/\/+$/, "") + "/" + renderTemplate(a.path, vars).replace(/^\/+/, "");
  const method = (a.method || "POST").toUpperCase();
  const body = a.body_template ? renderTemplate(a.body_template, vars, true) : undefined;
  if (!execute) return { status: "pending", error_code: "dry_run", result_message: `[dry-run] ${method} ${url}` };
  const headers = authHeaders(cfg);
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
  const text = (await r.text()).slice(0, 200);
  if (kind === "create" && r.status === 409) return { status: "success", http_status: 409, result_message: "Usuário já existia no sistema." };
  if (kind === "lookup" && r.status === 404) return { status: "success", http_status: 404, result_message: "Consulta funcionou: usuário não existe no sistema." };
  if (r.status === 401 || r.status === 403) return { status: "failed", http_status: r.status, error_code: "app_api_auth", result_message: `O sistema recusou a credencial (HTTP ${r.status}).` };
  if (!r.ok) return { status: "failed", http_status: r.status, error_code: "app_api_error", result_message: `O sistema respondeu com erro (HTTP ${r.status}): ${text}` };
  const ok = kind === "create" ? "Usuário criado no sistema." : kind === "disable" ? "Usuário desativado no sistema." : "Consulta funcionou: usuário encontrado.";
  return { status: "success", http_status: r.status, result_message: ok };
}
