import { describe, expect, it } from 'vitest';
import { parsePeopleSeries, PEOPLE_SERIES } from '@/lib/peopleActivity';
describe('people lifecycle contract', () => {
 it('has exactly Entradas and Saídas, never resource actions', () => {
  expect(PEOPLE_SERIES.map(s => s.label)).toEqual(['Entradas', 'Saídas']);
 });
 it('rejects legacy action and JML counts rather than displaying zero', () => {
  expect(() => parsePeopleSeries([{ dia: '2026-09-18', concessoes: 90, joiners: 4 }])).toThrow();
 });
 it('accepts only nonnegative integer person counts', () => {
  expect(parsePeopleSeries([{ dia: '2026-09-18', entradas: 1, saidas: 0 }])).toHaveLength(1);
  expect(() => parsePeopleSeries([{ dia: '2026-09-18', entradas: -1, saidas: 0 }])).toThrow();
  expect(() => parsePeopleSeries([])).toThrow();
 });
});
