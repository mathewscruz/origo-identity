import { describe, expect, it } from "vitest";
import { humanize, capitalize } from "@/lib/labels";

describe("labels", () => {
  it("todo status começa com maiúscula e nunca sai como código", () => {
    expect(humanize("waiting_approval")).toBe("Aguardando aprovação");
    expect(humanize("em_andamento")).toBe("Em andamento");
    expect(humanize("tecnico")).toBe("Técnico");
    expect(humanize("status_status")).toBe("Status status");
    expect(humanize("alto")).toBe("Alto");
    for (const v of ["ativo", "pending", "manual", "critico", "leaver", "funcional"]) {
      const h = humanize(v);
      expect(h.charAt(0)).toBe(h.charAt(0).toUpperCase());
      expect(h).not.toMatch(/_/);
    }
  });
  it("trata prefixos com dois-pontos e vazios", () => {
    expect(humanize("revisao:002c00bb-b195-47ea-9d67-b1006ca7cd9a")).toBe("Campanha de revisão");
    expect(humanize("individual:joao@origo.local")).toBe("Acesso direto · joao@origo.local");
    expect(humanize(null)).toBe("—");
    expect(humanize("", "n/d")).toBe("n/d");
    expect(capitalize("perfil de acesso")).toBe("Perfil de acesso");
  });
});
