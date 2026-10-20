import { describe, it, expect } from "vitest";
import { isAllowedAgentTask } from "@/lib/mcp/tools/agent-tasks";

describe("pedidos do painel atendidos pelo Hermes via MCP", () => {
  it("executa só rotinas da lista permitida", () => {
    expect(isAllowedAgentTask("sync-entra-licencas")).toBe(true);
    expect(isAllowedAgentTask("reconcile-identities")).toBe(false);
    expect(isAllowedAgentTask("sync-sharepoint-csv")).toBe(false);
  });
});
