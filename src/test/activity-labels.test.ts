import { describe, expect, it } from "vitest";
import { activitySentence, isActivityNoise } from "@/lib/activityLabels";

describe("atividade recente em linguagem de negócio", () => {
  it("criação de usuário concluída vira frase macro", () => {
    expect(activitySentence({ fonte: "fila", acao: "create", pessoa: "João Silva", recurso: null, status: "success" })).toBe("Criou o usuário João Silva no AD");
  });
  it("remoção de licença concluída cita a licença e a pessoa", () => {
    expect(activitySentence({ fonte: "fila", acao: "remove_license", pessoa: "Maria", recurso: "Microsoft 365 E3", status: "success" })).toBe("Tirou a licença Microsoft 365 E3 de Maria");
  });
  it("falha deixa claro que falhou", () => {
    expect(activitySentence({ fonte: "fila", acao: "assign_group", pessoa: "Ana", recurso: "VPN", status: "failed" })).toBe("Falhou: adicionar ao grupo VPN — Ana");
  });
  it("SQL administrativo não aparece na atividade recente", () => {
    expect(isActivityNoise({ fonte: "auditoria", acao: "admin_exec_sql" })).toBe(true);
    expect(isActivityNoise({ fonte: "auditoria", acao: "criar_colaborador" })).toBe(false);
  });
});

import { acaoIcon } from "@/components/ActivityFeed";
describe("ícones da atividade", () => {
  it("ações distintas têm ícones distintos", () => {
    const mk = (acao: string) => acaoIcon({ fonte: "auditoria", acao, ator: null } as any).icon;
    const icons = ["terceiro_cadastro_criado", "atribuir_perfil", "revogar_perfil", "admin_exec_sql", "glpi_access_ticket_auto_processed"].map(mk);
    expect(new Set(icons).size).toBe(5);
  });
});
