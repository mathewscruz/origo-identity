export function completedQueueLink(reference = new Date().toISOString()) {
  const from = new Date(new Date(reference).getTime() - 7 * 86400000).toISOString();
  return `/fila-provisionamento?status=success&processed_from=${encodeURIComponent(from)}`;
}
export function queueStatuses(key: string): string[] {
  return key === "agente" ? ["pending", "processing"] : [key];
}
export function isPreventivelySuspended(row: { suspenso_preventivo?: boolean | null; status?: string }) {
  return row.suspenso_preventivo === true;
}

/* Critérios espelhados de public.dashboard_metrics(); datas em "YYYY-MM-DD". */
export const todayISO = (d = new Date()) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type Terc = { ativo?: boolean | null; contrato_fim?: string | null; contrato_inicio?: string | null; ultima_revalidacao?: string | null; created_at?: string | null };
export const tercFiltros = {
  vencidos: (t: Terc, hoje = todayISO()) => !!t.ativo && !!t.contrato_fim && t.contrato_fim < hoje,
  vencendo: (t: Terc, hoje = todayISO()) => !!t.ativo && !!t.contrato_fim && t.contrato_fim >= hoje && t.contrato_fim <= addDays(hoje, 30),
  revalidar: (t: Terc, hoje = todayISO(), dias = 45) => {
    if (!t.ativo) return false;
    const base = t.ultima_revalidacao || t.contrato_inicio || (t.created_at ? t.created_at.slice(0, 10) : null);
    return !!base && base < addDays(hoje, -dias);
  },
};
export const TERC_FILTRO_LABEL: Record<string, string> = { vencidos: "Contrato vencido", vencendo: "Vencendo em 30 dias", revalidar: "A revalidar" };

export const excecaoVencendo = (e: { status?: string; validade?: string | null }, hoje = todayISO()) =>
  e.status === "aprovada" && !!e.validade && e.validade >= hoje && e.validade <= addDays(hoje, 15);

export const revisaoAtrasada = (r: { status?: string; data_fim?: string | null }, hoje = todayISO()) =>
  r.status === "em_andamento" && !!r.data_fim && r.data_fim < hoje;

export const licencaCritica = (l: { total: number; em_uso: number; is_trial?: boolean | null }, pct = 90) =>
  l.total > 0 && !l.is_trial && (l.em_uso / l.total) * 100 >= pct;

type Colab = { status?: string; entra_id?: string | null; cargo_id?: string | null };
export const colabFiltros = {
  sem_entra: (c: Colab) => c.status === "ativo" && !c.entra_id,
  sem_cargo: (c: Colab) => c.status === "ativo" && !c.cargo_id,
};
export const COLAB_FILTRO_LABEL: Record<string, string> = { sem_entra: "Sem conta Entra", sem_cargo: "Sem cargo" };
