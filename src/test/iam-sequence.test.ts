import { describe, it, expect } from "vitest";
import { completeImplicitPriorSteps, isBlocked, isGroupNotRemovable, passwordRecipient, stepOrder } from "@/lib/iamSequence";

describe("ordem fixa de criação e desativação", () => {
  it("segue a ordem 1–13 pedida", () => {
    const seq = ["create", "replicate_entra", "assign_license", "assign_group", "assign_app", "enable_litigation_hold", "send_password_teams",
      "disable_entra", "disable", "remove_license", "remove_group", "remove_app", "reply_ticket"];
    expect(seq.map(stepOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
  it("grupos não são entregues antes da licença terminar", () => {
    expect(isBlocked("assign_group", [{ action_type: "assign_license", status: "pending" }])).toBe(true);
    expect(isBlocked("assign_group", [{ action_type: "assign_license", status: "success" }])).toBe(false);
  });
  it("passo anterior que falhou segura os seguintes", () => {
    expect(isBlocked("assign_license", [{ action_type: "create", status: "failed" }])).toBe(true);
  });
  it("desativar AD espera desativar o Entra", () => {
    expect(isBlocked("disable", [{ action_type: "disable_entra", status: "processing" }])).toBe(true);
  });
  it("passos da criação não seguram a desativação", () => {
    expect(isBlocked("disable_entra", [{ action_type: "create", status: "failed" }])).toBe(false);
  });
});

describe("grupo não removível no desligamento", () => {
  it("grupo dinâmico não conta como falha", () => {
    expect(isGroupNotRemovable({ dynamicMembership: true })).toBe(true);
  });
  it("permissão negada do Graph não conta como falha", () => {
    expect(isGroupNotRemovable({ message: "Insufficient privileges to complete the operation" })).toBe(true);
  });
  it("outros erros continuam como falha", () => {
    expect(isGroupNotRemovable({ message: "timeout" })).toBe(false);
  });
});

describe("destino da senha", () => {
  it("vai para quem abriu o chamado", () => {
    expect(passwordRecipient("ana@origoenergia.com.br", "gestor@origoenergia.com.br")).toBe("ana@origoenergia.com.br");
  });
  it("sem chamado, vai para o gestor", () => {
    expect(passwordRecipient("sistema", "gestor@origoenergia.com.br")).toBe("gestor@origoenergia.com.br");
  });
});

describe("progresso visual da sequência", () => {
  const beforeTeams = ["success", "none", "success", "success", "none", "success", "none"] as const;

  it("completa Entra e Apps implícitos quando etapa posterior terminou", () => {
    expect(completeImplicitPriorSteps([...beforeTeams])).toEqual([
      "success", "success", "success", "success", "success", "success", "none",
    ]);
  });

  it("não completa senha antes do recibo do Teams", () => {
    expect(completeImplicitPriorSteps([...beforeTeams])[6]).toBe("none");
  });
});
