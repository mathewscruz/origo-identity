export const initialColaboradorStatusFilter = (status: string | null): string =>
  !status || status === "todos" ? "nao_desligados" : status;

export const matchesColaboradorStatus = (status: string, filter: string): boolean =>
  filter === "nao_desligados" || filter === "todos" ? status !== "desligado" : status === filter;
