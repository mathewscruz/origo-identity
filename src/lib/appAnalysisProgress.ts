export type AnalysisTaskStatus = "pending" | "running" | "done" | "error" | string;

export const ANALYSIS_PENDING_STALE_MS = 6 * 60_000;
export const ANALYSIS_RUNNING_STALE_MS = 10 * 60_000;

export type AnalysisProgress = {
  percent: number;
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
};

/** Progresso por etapas persistidas — nunca estima avanço interno do modelo. */
export function getAnalysisProgress(status: AnalysisTaskStatus): AnalysisProgress {
  if (status === "pending") {
    return {
      percent: 33,
      step: 1,
      totalSteps: 3,
      title: "Solicitação registrada",
      detail: "Aguardando o Hermes reservar a análise.",
    };
  }
  if (status === "running") {
    return {
      percent: 67,
      step: 2,
      totalSteps: 3,
      title: "Hermes analisando",
      detail: "O Hermes reservou a tarefa e está lendo o material.",
    };
  }
  return {
    percent: 100,
    step: 3,
    totalSteps: 3,
    title: status === "done" ? "Análise concluída" : "Análise encerrada com erro",
    detail: status === "done" ? "O diagnóstico foi entregue." : "A tarefa terminou sem diagnóstico.",
  };
}

export function isAnalysisStale(task: { status: AnalysisTaskStatus; created_at: string; started_at?: string | null }, now = Date.now()): boolean {
  const activityAt = task.status === "running" && task.started_at ? task.started_at : task.created_at;
  const age = now - new Date(activityAt).getTime();
  if (!Number.isFinite(age) || age < 0) return false;
  if (task.status === "pending") return age > ANALYSIS_PENDING_STALE_MS;
  if (task.status === "running") return age > ANALYSIS_RUNNING_STALE_MS;
  return false;
}

export function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  const seconds = Math.floor(safe / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}
