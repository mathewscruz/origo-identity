import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapStatus } from "./csvColabSync.ts";

Deno.test("normaliza os status funcionais reais do RH", () => {
  const cases: Array<[string, string]> = [
    ["Ativo", "ativo"],
    ["Demitido", "desligado"],
    ["Férias", "ferias"],
    ["Afast. Aux. Maternidade", "afastado"],
    ["Afast. Aux. Doença", "afastado"],
    ["Afast. Licença s/Remuneração", "afastado"],
    ["Atestado Médico", "afastado"],
    ["Licença Maternidade - Antecipação e/ou prorrogação", "afastado"],
    ["Licença Paternidade Estendida", "afastado"],
  ];

  for (const [source, expected] of cases) assertEquals(mapStatus(source), expected, source);
});

Deno.test("status desconhecido não desliga nem afasta automaticamente", () => {
  assertEquals(mapStatus("Situação RH não mapeada"), "ativo");
  assertEquals(mapStatus(""), "ativo");
});
