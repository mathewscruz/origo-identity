import { describe, it, expect } from "vitest";
import { revalidacaoVencida, semDono } from "@/lib/contasServico";

const hoje = new Date("2026-10-27T12:00:00Z");

describe("contas de serviço", () => {
  it("revalidação vence após 90 dias", () => {
    expect(revalidacaoVencida({ ativo: true, dono_colaborador_id: "x", ultima_revalidacao: "2026-07-01", created_at: "2026-01-01" }, 90, hoje)).toBe(true);
    expect(revalidacaoVencida({ ativo: true, dono_colaborador_id: "x", ultima_revalidacao: "2026-08-15", created_at: "2026-01-01" }, 90, hoje)).toBe(false);
  });
  it("conta desativada não fica vencida nem sem dono", () => {
    const c = { ativo: false, dono_colaborador_id: null, ultima_revalidacao: null, created_at: "2025-01-01" };
    expect(revalidacaoVencida(c, 90, hoje)).toBe(false);
    expect(semDono(c)).toBe(false);
  });
  it("conta ativa sem dono é sinalizada", () => {
    expect(semDono({ ativo: true, dono_colaborador_id: null, ultima_revalidacao: null, created_at: "2026-10-01" })).toBe(true);
  });
});
