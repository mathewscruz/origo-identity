/** Diagnóstico que o Hermes devolve ao analisar link/arquivo de um sistema. */
export type AcaoApi = { method: string; path: string; body_template?: string | null };
export type Diagnostico = {
  modo_sugerido?: "grupo" | "api" | "manual" | null;
  motivo?: string | null;
  grupo_nome?: string | null;
  api_base_url?: string | null;
  auth_type?: string | null;
  actions?: { create?: AcaoApi | null; disable?: AcaoApi | null; lookup?: AcaoApi | null } | null;
  perfis?: string[] | null;
  instrucoes_acesso?: string | null;
  instrucoes_revogacao?: string | null;
  lacunas?: string[] | null;
  segredos_removidos?: number;
};

const SECRET_KEY = /(pass(word)?|senha|secret|token|api[_-]?key|apikey|client[_-]?secret|authorization|bearer|credential|private[_-]?key)/i;
const SECRET_VALUE = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(sk|pk|rk|ghp|gho|xox[abp]|AKIA)[A-Za-z0-9_-]{10,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  /\b[A-Fa-f0-9]{32,}\b/g,
  /\b(password|senha|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"',}]{4,}/gi,
];

/** Remove tudo que parece credencial. Conta quantos valores foram descartados. */
export function limparSegredos(texto: string): { texto: string; removidos: number } {
  let removidos = 0;
  let t = texto;
  for (const re of SECRET_VALUE) t = t.replace(re, () => { removidos++; return "[removido]"; });
  return { texto: t, removidos };
}

function limpar(v: unknown, cont: { n: number }): unknown {
  if (typeof v === "string") { const r = limparSegredos(v); cont.n += r.removidos; return r.texto; }
  if (Array.isArray(v)) return v.map((x) => limpar(x, cont));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_KEY.test(k) && k !== "auth_type" && typeof x === "string" && x.length > 0 && !/\{\{\s*\w+\s*\}\}/.test(x)) { cont.n++; continue; }
      out[k] = limpar(x, cont);
    }
    return out;
  }
  return v;
}

/** Normaliza e limpa o diagnóstico recebido do Hermes. */
export function sanitizarDiagnostico(raw: unknown): Diagnostico {
  const cont = { n: 0 };
  const d = (limpar(raw ?? {}, cont) ?? {}) as Diagnostico;
  const modo = d.modo_sugerido && ["grupo", "api", "manual"].includes(d.modo_sugerido) ? d.modo_sugerido : null;
  return { ...d, modo_sugerido: modo, perfis: (d.perfis ?? []).filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim()), segredos_removidos: (d.segredos_removidos ?? 0) + cont.n };
}

export type ItemAplicavel = "modo" | "api" | "acoes" | "perfis" | "instrucoes";

/** Converte o diagnóstico (só os itens marcados) no que é gravado na ficha. Nunca grava credencial. */
export function diagnosticoParaFicha(d: Diagnostico, itens: ItemAplicavel[], configAtual: Record<string, unknown> = {}) {
  const app: Record<string, unknown> = {};
  let config: Record<string, unknown> | null = null;
  const perfis: string[] = [];
  if (itens.includes("modo") && d.modo_sugerido) app.modo_acesso = d.modo_sugerido;
  if (itens.includes("instrucoes")) {
    if (d.instrucoes_acesso) app.instrucoes_acesso = d.instrucoes_acesso;
    if (d.instrucoes_revogacao) app.instrucoes_revogacao = d.instrucoes_revogacao;
  }
  if (itens.includes("api") && (d.api_base_url || d.auth_type)) {
    config = { ...configAtual, ...(d.api_base_url ? { base_url: d.api_base_url } : {}), ...(d.auth_type ? { auth_type: d.auth_type } : {}) };
  }
  if (itens.includes("acoes") && d.actions) {
    const base = config ?? { ...configAtual };
    const acts = { ...((base.actions as Record<string, unknown>) ?? {}) };
    for (const k of ["create", "disable", "lookup"] as const) {
      const a = d.actions[k];
      if (a?.method && a?.path) acts[k] = { method: a.method.toUpperCase(), path: a.path, body_template: a.body_template ?? null };
    }
    config = { ...base, actions: acts };
  }
  if (itens.includes("perfis")) perfis.push(...(d.perfis ?? []));
  return { app, config, perfis };
}
