import { expect, it } from 'vitest';
import { basqueLabel, learnerSets } from './display';
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

it('creates a learner copy without changing stored text, translations, formation pieces, IDs or audio URLs', () => {
  const entry = { id: 'e', basque: 'LORATEGIA', translations: { es: ['jardín'] },
    note: null, image: null, emoji: null, group: null, audio: '/audio/existing.mp3',
    formation: { kind: 'derived' as const, parts: ['lora', '-tegi'] as [string, string] } };
  const source: HomeworkSet[] = [{ id: 's', kind: 'topic', title: 'Words', weekStart: null,
    description: null, sample: false, groups: [], entries: [entry] }];
  const result = learnerSets(source)[0]!.entries[0]!;
  expect(result.basque).toBe('Lorategia');
  expect(source[0]!.entries[0]!.basque).toBe('LORATEGIA');
  expect(result).toEqual({ ...entry, basque: 'Lorategia' });
  expect(basqueLabel(result.basque)).toBe(result.basque);
});
