import { expect, it } from 'vitest';
import { basqueLabel, spanishLabel, learnerSets } from './display';
import type { HomeworkSet } from '../types';

it('uses sentence case while preserving spelling and intentional name capitals', () => {
  for (const [source, expected] of [
    ['GAUR', 'Gaur'], ['gu', 'Gu'], ['ARRATSALDEAN', 'Arratsaldean'],
    ['Aurten', 'Aurten'], ['URTEA', 'Urtea'], ['JOAN DEN ASTEAN', 'Joan den astean'],
    ['aurrerlari', 'Aurrerlari'], ['BIZKAR-ZORROA', 'Bizkar-zorroa'],
    ['gaur Bilbon', 'Gaur Bilbon'], ['GAUR Bilbon', 'Gaur Bilbon'], ['"KAIXO!"', '"Kaixo!"'],
    ['ÉGUN', 'Égun'], ['', ''], ['-lari', '-Lari'],
  ]) expect(basqueLabel(source!)).toBe(expected);
});

it('creates a learner copy without changing stored text, Russian translations, formation pieces, IDs or audio URLs', () => {
  const entry = { id: 'e', basque: 'LORATEGIA', translations: { es: ['jardín', 'huerto'], ru: ['сад'] },
    note: null, image: null, emoji: null, group: null, audio: '/audio/existing.mp3',
    formation: { kind: 'derived' as const, parts: ['lora', '-tegi'] as [string, string] } };
  const source: HomeworkSet[] = [{ id: 's', kind: 'topic', title: 'Words', weekStart: null,
    description: null, sample: false, groups: [], entries: [entry] }];
  const result = learnerSets(source)[0]!.entries[0]!;
  expect(result.basque).toBe('Lorategia');
  expect(source[0]!.entries[0]!.basque).toBe('LORATEGIA');
  expect(result).toEqual({ ...entry, basque: 'Lorategia', translations: { es: ['Jardín', 'Huerto'], ru: ['сад'] } });
  expect(entry.translations.es).toEqual(['jardín', 'huerto']);
  expect(learnerSets(learnerSets(source))).toEqual(learnerSets(source));
  expect(basqueLabel(result.basque)).toBe(result.basque);
});

it('sentence-cases Spanish words and phrases without losing accents or name capitals', () => {
  for (const [source, expected] of [
    ['frontón', 'Frontón'], ['hoy', 'Hoy'], ['nosotros', 'Nosotros'],
    ['la semana pasada', 'La semana pasada'], ['ÁRBOL', 'Árbol'],
    ['¿qué es?', '¿Qué es?'], ['visitar Bilbao', 'Visitar Bilbao'],
    ['NIÑO', 'Niño'], ['El País Vasco', 'El País Vasco'], ['', ''],
  ]) expect(spanishLabel(source!)).toBe(expected);
});
