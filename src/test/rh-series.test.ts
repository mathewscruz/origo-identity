import { describe, expect, it } from 'vitest';
import { summarizeRhSeries } from '@/lib/rhActivity';
describe('RH additive daily contract', () => {
 it('does not invent zeros on legacy or partial responses', () => {
  expect(summarizeRhSeries([])).toBeNull();
  expect(summarizeRhSeries([{ rh_entradas: 1 }])).toBeNull();
 });
 it('keeps per-person final, partial and cadastral counts separate from queue actions', () => {
  expect(summarizeRhSeries([{ rh_entradas: 1, rh_saidas: 3, rh_parciais: 11, rh_cadastrais: 5 }, { rh_entradas: 2, rh_saidas: 0, rh_parciais: 0, rh_cadastrais: 0 }])).toEqual({ rh_entradas: 3, rh_saidas: 3, rh_parciais: 11, rh_cadastrais: 5 });
 });
 it('rejects incomplete and invalid series instead of hiding unavailable days', () => {
  expect(summarizeRhSeries([{ rh_entradas: 0, rh_saidas: 0, rh_parciais: 0, rh_cadastrais: 0 }, {}])).toBeNull();
  expect(summarizeRhSeries([{ rh_entradas: -1, rh_saidas: 0, rh_parciais: 0, rh_cadastrais: 0 }])).toBeNull();
 });
});
