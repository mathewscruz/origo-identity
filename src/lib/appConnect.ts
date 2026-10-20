export type ModoAcesso = "grupo" | "api" | "manual" | "sso";

export const MODOS_ACESSO: { value: Exclude<ModoAcesso, "sso">; label: string; hint: string }[] = [
  { value: "grupo", label: "Por grupo", hint: "Entrar no grupo dá acesso" },
  { value: "api", label: "Por API", hint: "O Hermes cria o usuário" },
  { value: "manual", label: "Manual", hint: "O dono faz, com instruções" },
];

/** Ação que a fila usa para dar/retirar o acesso, conforme a forma de acesso. */
export function acoesPorModo(modo: ModoAcesso): { conceder: string; revogar: string } {
  switch (modo) {
    case "grupo": return { conceder: "assign_group", revogar: "remove_group" };
    case "api": return { conceder: "create_user_app", revogar: "disable_user_app" };
    case "manual": return { conceder: "manual_access_task", revogar: "manual_revoke_task" };
    default: return { conceder: "assign_app", revogar: "remove_app" };
  }
}

/** O que ainda falta na ficha antes de ativar. */
export function fichaPendencias(a: {
  nome?: string | null; owner_colaborador_id?: string | null; revisor_colaborador_id?: string | null;
  modo_acesso?: string | null; grupo_id?: string | null; instrucoes_acesso?: string | null; api_base_url?: string | null;
}): string[] {
  const p: string[] = [];
  if (!a.nome?.trim() || a.nome === "Novo sistema") p.push("Dar um nome ao sistema");
  if (!a.owner_colaborador_id) p.push("Escolher o dono");
  if (!a.revisor_colaborador_id) p.push("Escolher o revisor");
  if (a.modo_acesso === "grupo" && !a.grupo_id) p.push("Informar o grupo que dá acesso");
  if (a.modo_acesso === "api" && !a.api_base_url) p.push("Informar o endereço da API");
  if (a.modo_acesso === "manual" && !a.instrucoes_acesso?.trim()) p.push("Explicar como dar acesso");
  return p;
}
