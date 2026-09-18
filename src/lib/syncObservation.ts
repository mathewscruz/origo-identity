interface QueueObservationCandidate {
  requested_by?: string | null;
  processed_by?: string | null;
  status?: string;
  action_type?: string;
  result_message?: string | null;
}

/** Legacy sync writes success rows for inventory, not execution. Fail open for
 * unknown provenance: never hide a real/manual/executor action or infer by date.
 * Keep aligned with the backend dashboard sync-observation contract.
 */
export function isSyncObservation(row: QueueObservationCandidate): boolean {
  if (row.requested_by !== 'entra_sync' || row.status !== 'success' || (row.processed_by !== null && row.processed_by !== '')) return false;
  return (
    ['assign_group', 'assign_license', 'assign_app'].includes(row.action_type ?? '') &&
    ['Importado do Entra ID (já existente)',
      'Importado do Entra ID (licença ativa confirmada no Graph).',
      'Importado do Entra ID (grupo faltante no catálogo).'].includes(row.result_message ?? '')
  ) || (
    ['remove_group', 'remove_license', 'remove_app'].includes(row.action_type ?? '') &&
    ['Correção de sync: recurso não está mais presente no Entra ID',
      'Correção de sync: recurso não está mais presente no Entra após ação Graph.',
      'Correção de sync: grupo é transitivo/herdado, não associação direta gerenciável no usuário.'].includes(row.result_message ?? '')
  );
}
