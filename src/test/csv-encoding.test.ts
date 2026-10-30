import { describe, expect, it } from "vitest";
import { decodeRhCsv } from "../../supabase/functions/_shared/csvEncoding";

describe("RH CSV encoding", () => {
  it("preserves exact Portuguese names in UTF-8", () => {
    expect(decodeRhCsv(new TextEncoder().encode("Ronaldo Lourenço Júnior"))).toBe("Ronaldo Lourenço Júnior");
  });
  it("reads legacy Excel accents without replacement characters", () => {
    const bytes = Uint8Array.from([..."Ronaldo Louren"].map(c => c.charCodeAt(0)).concat([0xe7, 0x6f, 0x20, 0x4a, 0xfa, 0x6e, 0x69, 0x6f, 0x72]));
    expect(decodeRhCsv(bytes)).toBe("Ronaldo Lourenço Júnior");
  });
  it("rejects already-corrupted source text instead of importing it", () => {
    expect(() => decodeRhCsv(new TextEncoder().encode("Ronaldo Louren\uFFFD o"))).toThrow("caracteres corrompidos");
  });
});