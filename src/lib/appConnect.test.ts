import { describe, expect, it } from "vitest";
import { situacaoSistema } from "./appConnect";

describe("situação de aplicações em demonstração", () => {
  it("identifica a demonstração sem considerar a integração operacional ativa", () => {
    expect(situacaoSistema({ demo_conectado: true, integracao_ativa: false, teste_status: "pendente" })).toBe("demo");
  });

  it("preserva o estado técnico fora da demonstração", () => {
    expect(situacaoSistema({ demo_conectado: false, integracao_ativa: false, teste_status: "pendente" })).toBe("aguardando");
    expect(situacaoSistema({ demo_conectado: false, integracao_ativa: true, teste_status: "ok" })).toBe("conectado");
  });

  it("exibe a conexão real depois da homologação mesmo com o marcador de demonstração", () => {
    expect(situacaoSistema({ demo_conectado: true, integracao_ativa: true, teste_status: "ok" })).toBe("conectado");
  });
});
