import { describe, it, expect } from "vitest";
import { splitPeriods } from "@/lib/peopleActivity";
const pt = (dia: string, entradas: number, saidas: number) => ({ dia, entradas, saidas });
describe("execuções = entradas + saídas de pessoas", () => {
  it("soma 3 entradas e 2 saídas como 5", () => {
    expect(splitPeriods([pt("2026-10-19", 2, 1), pt("2026-10-20", 1, 1)], 2).total).toBe(5);
  });
  it("separa período atual do anterior", () => {
    const r = splitPeriods([pt("2026-10-17", 4, 0), pt("2026-10-18", 0, 1), pt("2026-10-19", 1, 0), pt("2026-10-20", 0, 2)], 2);
    expect(r.total).toBe(3); expect(r.prevTotal).toBe(5); expect(r.cur).toHaveLength(2);
  });
});
