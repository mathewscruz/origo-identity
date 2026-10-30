import { describe, expect, it } from "vitest";
import { resolveActivityNames } from "@/lib/activityNames";
describe("verified activity name references", () => {
  const item = { pessoa: "Ronaldo Louren\uFFFDo J\uFFFDnior", detalhe: "Perfil atribuído a Ronaldo Louren\uFFFDo J\uFFFDnior" };
  it("restores both name and detail from a verified reference without mutating the source", () => {
    const [resolved] = resolveActivityNames([item], [{ corrupted_name: item.pessoa, reference_name: "Ronaldo Lourenço Junior" }]);
    expect(resolved.pessoa).toBe("Ronaldo Lourenço Junior");
    expect(resolved.detalhe).toBe("Perfil atribuído a Ronaldo Lourenço Junior");
    expect(item.pessoa).toContain("\uFFFD");
  });
  it("does not guess a name when references disagree", () => {
    expect(resolveActivityNames([item], [
      { corrupted_name: item.pessoa, reference_name: "Ronaldo Lourenço Junior" },
      { corrupted_name: item.pessoa, reference_name: "Ronaldo Lourenço Júnior" },
    ])[0].pessoa).toBe(item.pessoa);
  });
});