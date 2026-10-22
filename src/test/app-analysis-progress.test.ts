import { describe, expect, it } from "vitest";
import { ANALYSIS_PENDING_STALE_MS, ANALYSIS_RUNNING_STALE_MS, formatElapsed, getAnalysisProgress, isAnalysisStale } from "@/lib/appAnalysisProgress";

describe("progresso observável da análise do Hermes", () => {
  it("deriva o percentual somente das três etapas persistidas", () => {
    expect(getAnalysisProgress("pending")).toMatchObject({ percent: 33, step: 1, totalSteps: 3 });
    expect(getAnalysisProgress("running")).toMatchObject({ percent: 67, step: 2, totalSteps: 3 });
    expect(getAnalysisProgress("done")).toMatchObject({ percent: 100, step: 3, totalSteps: 3 });
  });

  it("sinaliza fila ou execução sem mudança dentro do limite", () => {
    const now = Date.parse("2026-10-22T15:00:00Z");
    expect(isAnalysisStale({ status: "pending", created_at: new Date(now - ANALYSIS_PENDING_STALE_MS - 1).toISOString() }, now)).toBe(true);
    expect(isAnalysisStale({ status: "running", created_at: new Date(now - 60_000).toISOString(), started_at: new Date(now - ANALYSIS_RUNNING_STALE_MS - 1).toISOString() }, now)).toBe(true);
    expect(isAnalysisStale({ status: "running", created_at: new Date(now - ANALYSIS_RUNNING_STALE_MS * 2).toISOString(), started_at: new Date(now - 60_000).toISOString() }, now)).toBe(false);
  });

  it("formata o tempo decorrido sem precisão fictícia", () => {
    expect(formatElapsed(42_000)).toBe("42s");
    expect(formatElapsed(125_000)).toBe("2min 5s");
    expect(formatElapsed(3_720_000)).toBe("1h 2min");
  });
});