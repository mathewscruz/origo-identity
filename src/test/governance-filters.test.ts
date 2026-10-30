import { describe, it, expect } from "vitest";
import { tercFiltros, excecaoVencendo, revisaoAtrasada, licencaCritica, colabFiltros } from "@/lib/dashboardFilters";
const H = "2026-10-30";
describe("filtros das pendências de governança", () => {
  it("contrato vencido = ativo com fim antes de hoje", () => {
    expect(tercFiltros.vencidos({ ativo: true, contrato_fim: "2026-10-29" }, H)).toBe(true);
    expect(tercFiltros.vencidos({ ativo: true, contrato_fim: H }, H)).toBe(false);
    expect(tercFiltros.vencidos({ ativo: false, contrato_fim: "2026-01-01" }, H)).toBe(false);
  });
  it("vencendo = fim entre hoje e +30 dias", () => {
    expect(tercFiltros.vencendo({ ativo: true, contrato_fim: "2026-11-29" }, H)).toBe(true);
    expect(tercFiltros.vencendo({ ativo: true, contrato_fim: "2026-11-30" }, H)).toBe(false);
  });
  it("revalidar = última revalidação há mais de 45 dias", () => {
    expect(tercFiltros.revalidar({ ativo: true, ultima_revalidacao: "2026-09-14" }, H, 45)).toBe(true);
    expect(tercFiltros.revalidar({ ativo: true, ultima_revalidacao: "2026-09-15" }, H, 45)).toBe(false);
  });
  it("exceção vencendo = aprovada com validade em até 15 dias", () => {
    expect(excecaoVencendo({ status: "aprovada", validade: "2026-11-14" }, H)).toBe(true);
    expect(excecaoVencendo({ status: "aprovada", validade: "2026-11-15" }, H)).toBe(false);
  });
  it("revisão atrasada = em andamento com prazo passado", () => {
    expect(revisaoAtrasada({ status: "em_andamento", data_fim: "2026-10-29" }, H)).toBe(true);
    expect(revisaoAtrasada({ status: "concluida", data_fim: "2026-10-29" }, H)).toBe(false);
  });
  it("licença crítica = 90% ou mais em uso, sem trial", () => {
    expect(licencaCritica({ total: 10, em_uso: 9 }, 90)).toBe(true);
    expect(licencaCritica({ total: 10, em_uso: 8 }, 90)).toBe(false);
    expect(licencaCritica({ total: 10, em_uso: 10, is_trial: true }, 90)).toBe(false);
  });
  it("ativos sem conta Entra / sem cargo", () => {
    expect(colabFiltros.sem_entra({ status: "ativo", entra_id: null })).toBe(true);
    expect(colabFiltros.sem_cargo({ status: "ferias", cargo_id: null })).toBe(false);
  });
});
