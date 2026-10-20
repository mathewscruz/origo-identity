import { describe, it, expect } from "vitest";
import { canOperate, canConfigure } from "@/lib/roles";
describe("perfis do painel", () => {
  it("Super Admin opera e configura", () => { expect(canOperate("platform_admin")).toBe(true); expect(canConfigure("platform_admin")).toBe(true); });
  it("Suporte opera mas não configura", () => { expect(canOperate("operador")).toBe(true); expect(canConfigure("operador")).toBe(false); });
  it("Leitor não opera nem configura", () => { expect(canOperate("viewer")).toBe(false); expect(canConfigure("viewer")).toBe(false); });
});
