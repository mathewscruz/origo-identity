import { describe, it, expect } from "vitest";
import { brandDomain, appInitials } from "@/lib/appBrands";
import { hasReplacementChar } from "../../supabase/functions/_shared/csvColabSync";

describe("ícones das aplicações", () => {
  it("Azure DevOps não vira Azure", () => expect(brandDomain("Azure DevOps")).toBe("dev.azure.com"));
  it("Power BI usa a marca oficial", () => expect(brandDomain("Power BI")).toBe("powerbi.microsoft.com"));
  it("endereço cadastrado tem prioridade", () => expect(brandDomain("CMS", "https://server.origofazenda.com.br/x")).toBe("server.origofazenda.com.br"));
  it("sistema interno fica com iniciais", () => { expect(brandDomain("Atlas")).toBeNull(); expect(appInitials("Academia Órigo")).toBe("AÓ"); });
});

describe("importação do RH", () => {
  it("não cria cargo/local com símbolo no lugar do acento", () => {
    expect(hasReplacementChar("S\uFFFDo Paulo")).toBe(true);
    expect(hasReplacementChar("São Paulo")).toBe(false);
  });
});
