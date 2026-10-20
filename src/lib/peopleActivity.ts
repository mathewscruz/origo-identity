export const PEOPLE_SERIES = [
  { key: 'entradas', label: 'Entradas', color: 'hsl(142, 71%, 45%)' },
  { key: 'saidas', label: 'Saídas', color: 'hsl(0, 84%, 60%)' },
] as const;
export interface PeopleSeriesPoint { dia: string; entradas: number; saidas: number }
/** Never silently substitute legacy action counts or missing fields with zero. */
export function parsePeopleSeries(value: unknown): PeopleSeriesPoint[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(p =>
    !p || typeof p.dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.dia) ||
    !Number.isSafeInteger(p.entradas) || p.entradas < 0 ||
    !Number.isSafeInteger(p.saidas) || p.saidas < 0)) {
    throw new Error('Contagem de pessoas indisponível; não equivale a zero.');
  }
  return value;
}
/** Splits a 2*days series into current/previous totals of people in + out. */
export function splitPeriods(series: PeopleSeriesPoint[], days: number) {
  const cur = series.slice(-days), prev = series.slice(0, Math.max(0, series.length - days));
  const sum = (s: PeopleSeriesPoint[]) => s.reduce((a, p) => ({ entradas: a.entradas + p.entradas, saidas: a.saidas + p.saidas }), { entradas: 0, saidas: 0 });
  const c = sum(cur), p = sum(prev);
  return { cur, ...c, total: c.entradas + c.saidas, prevTotal: p.entradas + p.saidas };
}
