import { describe, expect, it } from "vitest";
import { renderTemplate, runAppAction } from "../../supabase/functions/_shared/appApi";
import { fichaPendencias, situacaoSistema } from "@/lib/appConnect";

describe("sistemas por API", () => {
  it("troca os marcadores pelos dados da pessoa, escapando JSON", () => {
    expect(renderTemplate('{"name":"{{nome}}","email":"{{email}}"}', { nome: 'Ana "A"', email: "ana@x.com" }, true))
      .toBe('{"name":"Ana \\"A\\"","email":"ana@x.com"}');
  });
  it("no caminho, os valores vão codificados", () => {
    expect(renderTemplate("/users/{{email}}", { email: "a b@x.com" })).toBe("/users/a%20b%40x.com");
  });
  it("ficha por API exige como criar e como desativar", () => {
    const base = { nome: "GLPI", owner_colaborador_id: "a", revisor_colaborador_id: "b", modo_acesso: "api", api_base_url: "https://x" };
    expect(fichaPendencias(base)).toEqual(["Explicar como criar o usuário pela API", "Explicar como desativar o usuário pela API"]);
    expect(fichaPendencias({ ...base, api_actions: { create: {}, disable: {} } })).toEqual([]);
  });
  it("sem a ação configurada, falha com motivo claro e não chama o sistema", async () => {
    const r = await runAppAction({ base_url: "https://x" }, "create", {}, true);
    expect(r.status).toBe("failed");
    expect(r.error_code).toBe("app_api_action_missing");
  });
  it("em modo de teste só descreve a chamada", async () => {
    const r = await runAppAction({ base_url: "https://x/api/", actions: { disable: { method: "PATCH", path: "/users/{{email}}" } } }, "disable", { email: "a@x.com" }, false);
    expect(r).toMatchObject({ status: "pending", result_message: "[dry-run] PATCH https://x/api/users/a%40x.com" });
  });
  it("situação: falha do teste aparece como Falhou e sem teste como rascunho", () => {
    expect(situacaoSistema({ teste_status: "erro" })).toBe("falhou");
    expect(situacaoSistema({ teste_status: null })).toBe("rascunho");
  });
});
