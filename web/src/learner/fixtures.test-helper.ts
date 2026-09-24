import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Entry, HomeworkSet } from '../types';

interface SampleEntry {
  basque: string;
  translations: { es: string[]; ru?: string[] };
  group?: string;
  emoji?: string;
}

/** Loads a repository sample as the learner API would serve it. */
export function sampleSet(file: string, id: string, weekStart: string): HomeworkSet {
  const doc = JSON.parse(readFileSync(resolve(__dirname, '../../../samples', file), 'utf8'));
  return {
    id,
    kind: 'week',
    title: doc.title,
    weekStart,
    description: doc.description ?? null,
    sample: true,
    groups: doc.groups ?? [],
    entries: (doc.entries as SampleEntry[]).map((e, i) => ({
      id: `e${i}`,
      basque: e.basque,
      translations: e.translations,
      note: null,
      group: e.group ?? null,
      emoji: e.emoji ?? null,
      image: null,
    })),
  };
}

export function tinySet(id: string, weekStart: string, words: Array<[string, string[]]>): HomeworkSet {
  return {
    id,
    kind: 'week',
    title: id,
    weekStart,
    description: null,
    sample: false,
    groups: [],
    entries: words.map(([basque, es], i): Entry => ({ id: `w${i}`, basque, translations: { es }, note: null, group: null, emoji: null, image: null })),
  };
}
