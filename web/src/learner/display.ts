import type { HomeworkSet } from '../types';

/** Sentence-case learner labels; mixed-case interior capitals may be names. */
export function basqueLabel(text: string): string {
  const base = text.replace(/[\p{L}\p{M}]+/gu, (word) =>
    word === word.toLocaleUpperCase('eu') ? word.toLocaleLowerCase('eu') : word);
  // Skip leading punctuation and keep accents, spaces and hyphens intact.
  return base.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('eu'));
}

/** A learner-only copy: stored spelling, admin editing and audio URLs stay intact. */
export function learnerSets(sets: HomeworkSet[]): HomeworkSet[] {
  return sets.map((set) => ({ ...set, entries: set.entries.map((entry) => ({ ...entry, basque: basqueLabel(entry.basque) })) }));
}
