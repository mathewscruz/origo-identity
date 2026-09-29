/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const integrationsPage = readFileSync(
  resolve(process.cwd(), "src/pages/configuracoes/IntegracoesPage.tsx"),
  "utf8",
);
const csvEngine = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/csvColabSync.ts"),
  "utf8",
);
const sharepointSync = readFileSync(
  resolve(process.cwd(), "supabase/functions/sync-sharepoint-csv/index.ts"),
  "utf8",
);
const dashboardPage = readFileSync(
  resolve(process.cwd(), "src/pages/Dashboard.tsx"),
  "utf8",
);
const peopleChart = readFileSync(
  resolve(process.cwd(), "src/components/PeopleLifecycleChart.tsx"),
  "utf8",
);

describe("gestão automática da base RH pelo IAM", () => {
  it("não expõe controles manuais ou quarentena da base RH na tela de integrações", () => {
    expect(integrationsPage).not.toContain("Base do RH — SharePoint");
    expect(integrationsPage).not.toContain("Rodar ciclo diário agora");
    expect(integrationsPage).not.toContain("Quarentena da importação");
    expect(integrationsPage).not.toContain("Importação manual (contingência)");
  });

  it("não desliga identidades apenas porque ficaram ausentes do CSV", () => {
    expect(csvEngine).toContain("Ausência é informativa; desligamento exige status explícito no RH ou decisão aplicável do GLPI.");
    expect(csvEngine).not.toContain("p_motivo: `Ausente no CSV do RH");
  });

  it("ignora de forma idempotente o arquivo já processado", () => {
    expect(sharepointSync).toContain("sharepoint_rh_last_sha256");
    expect(sharepointSync).toContain('reason: "unchanged"');
  });

  it("remove o card legado Ciclo RH e equaliza os gráficos do dashboard", () => {
    expect(dashboardPage).not.toContain('label: "Ciclo RH"');
    expect(dashboardPage).toContain('className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2"');
    expect(dashboardPage).toContain('className="h-full min-h-[390px] flex flex-col"');
    expect(peopleChart).toContain('className="h-full min-h-[390px] flex flex-col"');
  });
});
