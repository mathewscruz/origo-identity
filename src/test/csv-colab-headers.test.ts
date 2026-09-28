import { describe, expect, it } from "vitest";
import { parseCsv } from "../../supabase/functions/_shared/csvColabSync";

const requiredTail = [
  "mail",
  "company",
  "title",
  "status",
  "Data_Admissao",
  "Cadastro_Pessoa_Fisica",
  "Base_Local",
].join(",");

const valuesTail = [
  "ana@origoenergia.com.br",
  "Origo",
  "Analista",
  "Ativo",
  "2026-09-28",
  "00000000000",
  "BH",
].join(",");

describe("parseCsv — aliases de cabeçalho do RH", () => {
  it("aceita display_name e employ_id produzidos pela base do SharePoint", () => {
    const csv = `display_name,employ_id,${requiredTail}\nAna Silva,12345,${valuesTail}\n`;

    const result = parseCsv(csv);

    expect(result.invalid).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].displayName).toBe("Ana Silva");
    expect(result.rows[0].employID).toBe("12345");
  });

  it("continua aceitando displayName e employID canônicos", () => {
    const csv = `displayName,employID,${requiredTail}\nAna Silva,12345,${valuesTail}\n`;

    const result = parseCsv(csv);

    expect(result.rows).toHaveLength(1);
  });
});
