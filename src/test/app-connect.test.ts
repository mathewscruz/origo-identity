import { describe, expect, it } from "vitest";
import { acoesPorModo, fichaPendencias } from "@/lib/appConnect";

describe("conectar sistemas", () => {
  it("acesso por grupo coloca e tira a pessoa do grupo", () => {
    expect(acoesPorModo("grupo")).toEqual({ conceder: "assign_group", revogar: "remove_group" });
  });
  it("acesso manual gera tarefa para o dono", () => {
    expect(acoesPorModo("manual")).toEqual({ conceder: "manual_access_task", revogar: "manual_revoke_task" });
  });
  it("acesso por API cria e desabilita o usuário no aplicativo", () => {
    expect(acoesPorModo("api")).toEqual({ conceder: "create_user_app", revogar: "disable_user_app" });
  });
  it("não ativa sem dono e revisor", () => {
    const p = fichaPendencias({ nome: "GLPI", modo_acesso: "grupo", grupo_id: "g1" });
    expect(p).toContain("Escolher o dono");
    expect(p).toContain("Escolher o revisor");
  });
  it("ficha completa por grupo não tem pendências", () => {
    expect(fichaPendencias({ nome: "GLPI", owner_colaborador_id: "a", revisor_colaborador_id: "b", modo_acesso: "grupo", grupo_id: "g1" })).toEqual([]);
  });
});
