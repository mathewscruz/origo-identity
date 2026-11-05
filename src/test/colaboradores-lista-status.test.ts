import { describe, expect, it } from "vitest";
import { initialColaboradorStatusFilter, matchesColaboradorStatus } from "@/lib/colaboradoresListaStatus";

describe("filtro de colaboradores", () => {
  it("abre a lista exibindo todos os vínculos exceto desligados", () => {
    expect(initialColaboradorStatusFilter(null)).toBe("nao_desligados");
    for (const status of ["ativo", "ferias", "afastado", "inativo"]) {
      expect(matchesColaboradorStatus(status, initialColaboradorStatusFilter(null))).toBe(true);
    }
    expect(matchesColaboradorStatus("desligado", initialColaboradorStatusFilter(null))).toBe(false);
  });

  it("preserva filtro explícito por status, inclusive desligado", () => {
    expect(matchesColaboradorStatus("desligado", initialColaboradorStatusFilter("desligado"))).toBe(true);
    expect(matchesColaboradorStatus("ferias", initialColaboradorStatusFilter("ativo"))).toBe(false);
    expect(matchesColaboradorStatus("ferias", initialColaboradorStatusFilter("ferias"))).toBe(true);
  });

  it("interpreta o filtro antigo 'todos' como não desligados", () => {
    expect(initialColaboradorStatusFilter("todos")).toBe("nao_desligados");
    expect(matchesColaboradorStatus("desligado", initialColaboradorStatusFilter("todos"))).toBe(false);
  });
});
