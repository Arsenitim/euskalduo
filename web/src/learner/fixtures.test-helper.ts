import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Entry, EntryType, Formation, GrammarExercise, HomeworkSet, SentenceExercise } from '../types';

interface SampleEntry {
  id?: string;
  type?: EntryType;
  sentence?: Partial<SentenceExercise>;
  grammar?: GrammarExercise;
  formation?: Formation;
  note?: string;
  basque: string;
  translations: { es: string[]; ru?: string[] };
  group?: string;
  emoji?: string;
}

/** Loads a repository sample as the learner API would serve it. */
export function sampleSet(file: string, id: string, receivedOn: string | null = null): HomeworkSet {
  const doc = JSON.parse(readFileSync(resolve(__dirname, '../../../samples', file), 'utf8'));
  return {
    id,
    kind: doc.kind === 'topic' ? 'topic' : 'sheet',
    title: doc.title,
    receivedOn,
    description: doc.description ?? null,
    sample: true,
    groups: doc.groups ?? [],
    entries: (doc.entries as SampleEntry[]).map((e, i) => ({
      id: e.id ?? `e${i}`,
      type: e.type ?? 'word',
      sentence: e.sentence ? { tiles: e.sentence.tiles ?? [], alternatives: e.sentence.alternatives ?? [], distractors: e.sentence.distractors ?? [] } : null,
      grammar: e.grammar ?? null,
      basque: e.basque,
      translations: e.translations,
      note: e.note ?? null,
      formation: e.formation ?? null,
      group: e.group ?? null,
      emoji: e.emoji ?? null,
      image: null,
    })),
  };
}

export function tinySet(id: string, _received: string | null, words: Array<[string, string[]]>): HomeworkSet {
  return {
    id,
    kind: 'sheet',
    title: id,
    receivedOn: null,
    description: null,
    sample: false,
    groups: [],
    entries: words.map(([basque, es], i): Entry => ({ id: `w${i}`, basque, translations: { es }, note: null, group: null, emoji: null, image: null })),
  };
}
