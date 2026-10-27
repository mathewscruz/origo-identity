/** Regras das contas de serviço (revalidação e situação). */
export const REVALIDACAO_PADRAO_DIAS = 90;

export interface ContaServicoBase {
  ativo: boolean;
  dono_colaborador_id: string | null;
  ultima_revalidacao: string | null;
  created_at: string;
}

export function diasDesdeRevalidacao(c: ContaServicoBase, hoje = new Date()): number {
  const base = new Date(c.ultima_revalidacao ?? c.created_at);
  return Math.floor((hoje.getTime() - base.getTime()) / 86400000);
}

export function revalidacaoVencida(c: ContaServicoBase, dias = REVALIDACAO_PADRAO_DIAS, hoje = new Date()): boolean {
  return c.ativo && diasDesdeRevalidacao(c, hoje) > dias;
}

export function semDono(c: ContaServicoBase): boolean {
  return c.ativo && !c.dono_colaborador_id;
}

/** Nomes que sugerem conta de serviço entre os terceiros (para mover com um clique). */
export function pareceContaServico(t: { nome?: string | null; email?: string | null; empresa_terceira?: string | null }): boolean {
  const s = `${t.nome ?? ""} ${t.email ?? ""}`.toLowerCase();
  return /(^|[\s._-])(svc|service|bot|noreply|no-reply|integra|admin|administrativo|api|sistema)([\s._@-]|$)/.test(s) || /@/.test(t.nome ?? "");
}
