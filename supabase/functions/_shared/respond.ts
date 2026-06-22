import { corsHeaders } from "./cors.ts";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

export function ok<T>(body: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init, headers: { ...JSON_HEADERS, ...(init.headers || {}) } });
}

export function fail(status: number, error: string, opts: { code?: string; details?: unknown } = {}): Response {
  return new Response(
    JSON.stringify({ error, code: opts.code, details: opts.details }),
    { status, headers: JSON_HEADERS },
  );
}

export function badRequest(error: string, details?: unknown) { return fail(400, error, { code: "bad_request", details }); }
export function unauthorized(error = "Não autorizado") { return fail(401, error, { code: "unauthorized" }); }
export function forbidden(error = "Acesso negado") { return fail(403, error, { code: "forbidden" }); }
export function notFound(error = "Não encontrado") { return fail(404, error, { code: "not_found" }); }
export function serverError(error: string, details?: unknown) { return fail(500, error, { code: "server_error", details }); }
