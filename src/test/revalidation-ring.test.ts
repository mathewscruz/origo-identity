import { describe, it, expect } from "vitest";
import { revalidationTone } from "@/lib/revalidationRing";

describe("anel de revalidação", () => {
  it("vencida fica vermelha", () => expect(revalidationTone(-1)).toBe("destructive"));
  it("15 dias ou menos fica amarela", () => { expect(revalidationTone(15)).toBe("warning"); expect(revalidationTone(0)).toBe("warning"); });
  it("acima de 15 dias fica verde", () => expect(revalidationTone(16)).toBe("success"));
});
