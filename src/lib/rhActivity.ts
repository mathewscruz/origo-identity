/** Additive dashboard_series RH fields; queue counts remain actions, not people. */
export const RH_SERIES = [
  { key: 'rh_entradas', label: 'RH: entradas verificadas (pessoas)', color: 'hsl(176, 74%, 34%)' },
  { key: 'rh_saidas', label: 'RH: saídas verificadas (pessoas)', color: 'hsl(262, 52%, 47%)' },
  { key: 'rh_parciais', label: 'RH: saídas parciais (pessoas)', color: 'hsl(24, 90%, 55%)' },
  { key: 'rh_cadastrais', label: 'RH: atualizações cadastrais (pessoas)', color: 'hsl(215, 16%, 47%)' },
] as const;
type RhKey = typeof RH_SERIES[number]['key'];
export function summarizeRhSeries(series: Partial<Record<RhKey, number>>[]): Record<RhKey, number> | null {
  if (!series.length || !series.every((point) => RH_SERIES.every(({ key }) => Number.isInteger(point[key]) && point[key]! >= 0))) return null;
  return series.reduce<Record<RhKey, number>>((totals, point) => {
    for (const { key } of RH_SERIES) totals[key] += point[key]!;
    return totals;
  }, { rh_entradas: 0, rh_saidas: 0, rh_parciais: 0, rh_cadastrais: 0 });
}
