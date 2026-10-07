import type { HomeworkSet } from '../types';

/** Sentence-case learner labels; mixed-case interior capitals may be names. */
function sentenceLabel(text: string, locale: 'eu' | 'es'): string {
  const base = text.replace(/[\p{L}\p{M}]+/gu, (word) =>
    word === word.toLocaleUpperCase(locale) ? word.toLocaleLowerCase(locale) : word);
  // Skip leading punctuation and keep accents, spaces and hyphens intact.
  return base.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase(locale));
}

export const basqueLabel = (text: string): string => sentenceLabel(text, 'eu');
export const spanishLabel = (text: string): string => sentenceLabel(text, 'es');

/** A learner-only copy: stored spelling, admin editing and audio URLs stay intact. */
export function learnerSets(sets: HomeworkSet[]): HomeworkSet[] {
  return sets.map((set) => ({ ...set, entries: set.entries.map((entry) => ({
    ...entry,
    basque: basqueLabel(entry.basque),
    translations: { ...entry.translations, es: entry.translations.es.map(spanishLabel) },
  })) }));
}
