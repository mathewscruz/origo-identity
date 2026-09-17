import { describe, it, expect } from "vitest";
import { actionScope, actionLabel, statusLabel, QUEUE_ACTION_LABELS } from "@/lib/queueLabels";
import { queueResourceKey } from "@/hooks/useOrigoData";

describe("queueLabels", () => {
  it("classifica o sistema-alvo de cada ação", () => {
    expect(actionScope("create")).toBe("AD");
    expect(actionScope("reset_password")).toBe("AD");
    expect(actionScope("assign_group")).toBe("Entra");
    expect(actionScope("disable_entra")).toBe("Entra");
    expect(actionScope("assign_sharepoint")).toBe("SharePoint");
    expect(actionScope("create_user_app")).toBe("App externo");
    expect(actionScope("review_orphan_entra")).toBe("IAM");
  });

  it("tem rótulo para todas as ações que o agente executa", () => {
    const agentActions = [
      "create", "create_if_not_exists", "update", "disable", "reset_password",
      "assign_group", "remove_group", "assign_license", "remove_license", "assign_app", "remove_app",
      "assign_sharepoint", "remove_sharepoint", "disable_entra", "enable_entra", "update_entra",
      "create_user_app", "update_user_app", "disable_user_app", "delete_user_app",
    ];
    for (const a of agentActions) expect(QUEUE_ACTION_LABELS[a], a).toBeTruthy();
    // ação desconhecida nunca aparece como código na tela: vira texto limpo com inicial maiúscula
    expect(actionLabel("acao_desconhecida")).toBe("Acao desconhecida");
    expect(statusLabel("waiting_approval")).toBe("Aguardando aprovação");
  });
});

describe("queueResourceKey", () => {
  it("segue a convenção do banco (iam_queue_resource_key)", () => {
    expect(queueResourceKey({ id: "1", action_type: "assign_group", payload_json: { groupId: "g1" } })).toBe("grupo:g1");
    expect(queueResourceKey({ id: "1", action_type: "remove_license", payload_json: { skuId: "sku" } })).toBe("licenca:sku");
    expect(queueResourceKey({ id: "1", action_type: "assign_app", payload_json: { appId: "a1" } })).toBe("app:a1");
    expect(queueResourceKey({ id: "1", action_type: "assign_app", payload_json: { resourceType: "sharepoint", siteId: "s", driveItemId: "d" } })).toBe("sharepoint:s:d:leitura");
    expect(queueResourceKey({ id: "1", action_type: "assign_sharepoint", payload_json: { siteId: "s", permission: "edicao" } })).toBe("sharepoint:s::edicao");
  });

  it("prefere a resource_key gravada pelo banco", () => {
    expect(queueResourceKey({ id: "1", action_type: "assign_group", resource_key: "grupo:x", payload_json: { groupId: "y" } })).toBe("grupo:x");
  });
});
