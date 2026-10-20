import { describe, expect, it } from "vitest";
import { diagnosticoParaFicha, limparSegredos, sanitizarDiagnostico } from "@/lib/appAnalysis";
import { HERMES_SELF_TASKS, isAllowedAgentTask } from "@/lib/mcp/tools/agent-tasks";

describe("análise de documentação pelo Hermes", () => {
  it("descarta credenciais do diagnóstico", () => {
    const d = sanitizarDiagnostico({ motivo: "use Bearer abcdefghijklmnop1234", api_token: "segredo123", auth_type: "bearer" });
    expect(d.motivo).toBe("use [removido]");
    expect((d as Record<string, unknown>).api_token).toBeUndefined();
    expect(d.auth_type).toBe("bearer");
    expect(d.segredos_removidos).toBe(2);
  });
  it("mantém marcadores de modelo como {{email}}", () => {
    expect(limparSegredos('{"email":"{{email}}"}').removidos).toBe(0);
  });
  it("só aplica os itens marcados e preserva a credencial já salva", () => {
    const d = sanitizarDiagnostico({ modo_sugerido: "api", api_base_url: "https://x", actions: { create: { method: "post", path: "/users" } }, perfis: ["Leitor"] });
    const r = diagnosticoParaFicha(d, ["api", "acoes"], { api_token: "guardado" });
    expect(r.app).toEqual({});
    expect(r.config).toEqual({ api_token: "guardado", base_url: "https://x", actions: { create: { method: "POST", path: "/users", body_template: null } } });
    expect(r.perfis).toEqual([]);
  });
  it("a análise é tarefa do próprio Hermes", () => {
    expect(isAllowedAgentTask("analyze-app-docs")).toBe(true);
    expect(HERMES_SELF_TASKS).toContain("analyze-app-docs");
  });
});
