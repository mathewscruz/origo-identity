// Ícone oficial de cada sistema: nome do sistema → domínio da marca (o ícone vem do site oficial).
// Sistemas internos (sem marca pública) ficam com as iniciais.
const BRANDS: [RegExp, string][] = [
  [/azure\s*devops/i, "dev.azure.com"],
  [/azure/i, "azure.microsoft.com"],
  [/dynamics/i, "dynamics.microsoft.com"],
  [/power\s*bi/i, "powerbi.microsoft.com"],
  [/databricks/i, "databricks.com"],
  [/grafana/i, "grafana.com"],
  [/glpi/i, "glpi-project.org"],
  [/vexpenses/i, "vexpenses.com"],
  [/projuris/i, "projuris.com.br"],
  [/splitc/i, "splitc.com.br"],
  [/sharepoint/i, "sharepoint.com"],
  [/teams/i, "teams.microsoft.com"],
  [/salesforce/i, "salesforce.com"],
  [/jira|confluence|atlassian/i, "atlassian.com"],
  [/github/i, "github.com"],
  [/servicenow/i, "servicenow.com"],
  [/sap\b/i, "sap.com"],
  [/totvs|protheus/i, "totvs.com"],
  [/senior/i, "senior.com.br"],
];

export function brandDomain(nome?: string | null, url?: string | null): string | null {
  if (url) { try { return new URL(url).hostname; } catch { /* segue */ } }
  if (!nome) return null;
  return BRANDS.find(([re]) => re.test(nome))?.[1] ?? null;
}

export function appInitials(nome?: string | null): string {
  const w = String(nome ?? "?").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}
