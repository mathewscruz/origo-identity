import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { acaoIcon, type ActivityItem } from "@/components/ActivityFeed";
import HermesIcon from "@/components/icons/HermesIcon";
import { CheckCircle2, ScrollText } from "lucide-react";

const base = (over: Partial<ActivityItem>): ActivityItem => ({
  fonte: "auditoria", id: "1", ts: "2026-10-20T12:00:00Z", categoria: "acesso",
  acao: "glpi_access_ticket_auto_processed", pessoa: "Ana Teste", pessoa_tipo: null,
  recurso: null, status: null, ator: "origo-agente", origem: "auditoria", detalhe: null, link: null, ...over,
});

describe("ícone do Hermes na atividade recente", () => {
  it("registros do próprio agente usam a marca do Hermes", () => {
    for (const ator of ["origo-agente", "hermes-agent@origoenergia.com.br", "Hermes", "Origo Agent"]) {
      const r = acaoIcon(base({ ator }));
      expect(r.icon).toBe(HermesIcon);
      expect(r.tone).toBe("bg-primary/10 text-primary");
    }
  });
  it("registro feito por pessoa mantém o ícone genérico", () => {
    expect(acaoIcon(base({ ator: "mathews.cruz@origoenergia.com.br" })).icon).toBe(ScrollText);
  });
  it("fila concluída continua mostrando o status, não a marca do agente", () => {
    expect(acaoIcon(base({ fonte: "fila", acao: "disable", status: "success", ator: "origo-agente" })).icon).toBe(CheckCircle2);
  });
  it("fila ainda não executada mostra a marca do Hermes", () => {
    expect(acaoIcon(base({ fonte: "fila", acao: "disable", status: "pending", ator: "origo-agente" })).icon).toBe(HermesIcon);
  });
});
