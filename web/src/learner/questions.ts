import type { Entry, Group, HomeworkSet, Lang } from '../types';
import { answerKey, looseKey } from './normalize';
import { entryKey } from './progress';
import { pick, shuffle, weightedSample, type Rng } from './random';
import { isDue, selectionWeight, type EntryStats } from './scheduler';

export interface Item {
  setId: string;
  entry: Entry;
  key: string;
}

export interface Option {
  label: string;
  correct: boolean;
}

interface WordQuestionBase {
  id: string;
  item: Item;
  retry: boolean;
}

export type WordQuestion =
  | (WordQuestionBase & { kind: 'meaning-choice'; options: Option[] })
  | (WordQuestionBase & { kind: 'basque-choice'; options: Option[]; pictureOnly: boolean })
  | (WordQuestionBase & { kind: 'spell'; tiles: string[] | null })
  | (WordQuestionBase & { kind: 'type-meaning' });

export interface OrderQuestion {
  id: string;
  kind: 'order';
  setId: string;
  group: Group;
  items: Item[];
  shuffled: Item[];
}

export type Question = WordQuestion | OrderQuestion;
export type WordKind = WordQuestion['kind'];

export type Mode = { kind: 'week'; setId: string } | { kind: 'mix'; setIds: string[] };

export const ROUND_MAX = 10;
export const MAX_REVIEW_IN_WEEK = 2;
export const MAX_OPTIONS = 4;
const MAX_TILE_LETTERS = 14;
const ORDER_RUN = 5;

export interface RoundInput {
  sets: HomeworkSet[];
  mode: Mode;
  stats: Record<string, EntryStats>;
  today: string;
  lang: Lang;
  rng: Rng;
}

export function meaningsOf(entry: Entry, lang: Lang): string[] {
  const list = entry.translations[lang];
  return list && list.length > 0 ? list : entry.translations.es;
}

export function itemsOf(set: HomeworkSet): Item[] {
  return set.entries.map((entry) => ({ setId: set.id, entry, key: entryKey(set.id, entry.id) }));
}

/** 3 questions for a single word, up to ROUND_MAX; roughly two per word. */
export function roundLength(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.min(ROUND_MAX, Math.max(3, wordCount * 2));
}

/**
 * Builds one practice round.
 *
 * Week mode: the chosen set supplies every word question except at most
 * MAX_REVIEW_IN_WEEK (and ≤ 20 %) slots, which go to *due* words from other
 * weeks the learner has already practised.
 * Mix mode: every selected set gets at least one word (when the round is
 * long enough); remaining slots are sampled so each set has an equal share.
 * A set with an ordered group (months, weekdays…) may add one ordering task.
 */
export function buildRound(input: RoundInput): Question[] {
  const { sets, mode, stats, today, rng } = input;
  const allItems = sets.flatMap(itemsOf);
  const weight = (item: Item) => selectionWeight(stats[item.key], today);

  const sourceSets =
    mode.kind === 'week'
      ? sets.filter((s) => s.id === mode.setId)
      : sets.filter((s) => mode.setIds.includes(s.id));
  const sourceItems = sourceSets.flatMap(itemsOf);
  const length = roundLength(sourceItems.length);
  if (length === 0) return [];

  const order = length >= 6 ? buildOrderQuestion(sourceSets, rng) : null;
  let slots = length - (order ? 1 : 0);

  let picks: Item[];
  if (mode.kind === 'week') {
    const reviewPool = allItems.filter((i) => i.setId !== mode.setId && (stats[i.key]?.seen ?? 0) > 0 && isDue(stats[i.key], today));
    const reviewCount = Math.min(MAX_REVIEW_IN_WEEK, Math.floor(length * 0.2), reviewPool.length);
    slots -= reviewCount;
    picks = [...pickWords(sourceItems, slots, weight, rng), ...weightedSample(reviewPool, weight, reviewCount, rng)];
  } else {
    picks = pickMixed(sourceSets.map(itemsOf).filter((l) => l.length > 0), slots, weight, rng);
  }

  const used = new Map<string, WordKind[]>();
  const questions: WordQuestion[] = picks.map((item, index) => {
    const previous = used.get(item.key) ?? [];
    const q = wordQuestion(item, chooseKind(item, stats[item.key], previous, allItems, input), allItems, input, `q${index}`, false);
    used.set(item.key, [...previous, q.kind]);
    return q;
  });

  const arranged: Question[] = spreadRepeats(shuffle(questions, rng));
  if (order) {
    const at = Math.max(1, Math.floor(arranged.length / 2) + Math.floor(rng() * Math.ceil(arranged.length / 2)));
    arranged.splice(at, 0, order);
  }
  return arranged;
}

/** Picks `slots` words, repeating words only when the pool is too small. */
function pickWords(items: Item[], slots: number, weight: (i: Item) => number, rng: Rng): Item[] {
  const result: Item[] = [];
  while (result.length < slots && items.length > 0) {
    result.push(...weightedSample(items, weight, Math.min(items.length, slots - result.length), rng));
  }
  return result;
}

function pickMixed(perSet: Item[][], slots: number, weight: (i: Item) => number, rng: Rng): Item[] {
  const result: Item[] = [];
  // One guaranteed word per selected set (random sets if there are more sets than slots).
  for (const list of shuffle(perSet, rng).slice(0, slots)) {
    result.push(...weightedSample(list, weight, 1, rng));
  }
  // Remaining slots: weight normalised by set so every set has the same share.
  const setTotal = new Map<string, number>();
  for (const list of perSet) {
    setTotal.set(list[0]!.setId, list.reduce((sum, i) => sum + weight(i), 0));
  }
  const normalised = (i: Item) => weight(i) / (setTotal.get(i.setId) ?? 1);
  const remaining = perSet.flat().filter((i) => !result.includes(i));
  const extra = Math.max(0, slots - result.length);
  const fresh = weightedSample(remaining, normalised, extra, rng);
  result.push(...fresh);
  if (result.length < slots) {
    result.push(...pickWords(perSet.flat(), slots - result.length, normalised, rng));
  }
  return result;
}

function chooseKind(item: Item, stats: EntryStats | undefined, previous: WordKind[], allItems: Item[], input: RoundInput): WordKind {
  const box = stats?.box ?? 0;
  const seen = (stats?.seen ?? 0) > 0;
  const weights: Record<WordKind, number> = !seen || box === 0
    ? { 'meaning-choice': 3, 'basque-choice': 2, spell: 1, 'type-meaning': 0 }
    : box <= 2
      ? { 'meaning-choice': 1, 'basque-choice': 2, spell: 2, 'type-meaning': box === 2 ? 1 : 0 }
      : { 'meaning-choice': 1, 'basque-choice': 1, spell: 2, 'type-meaning': 2 };
  if (meaningOptions(item, allItems, input.lang, input.rng).length < 2) weights['meaning-choice'] = 0;
  if (basqueOptions(item, allItems, input.rng).length < 2) weights['basque-choice'] = 0;
  for (const kind of previous) weights[kind] *= 0.1;
  const kinds = (Object.keys(weights) as WordKind[]).filter((k) => weights[k] > 0);
  return weightedSample(kinds, (k) => weights[k], 1, input.rng)[0] ?? 'spell';
}

function wordQuestion(item: Item, kind: WordKind, allItems: Item[], input: RoundInput, id: string, retry: boolean): WordQuestion {
  const { lang, rng } = input;
  switch (kind) {
    case 'meaning-choice':
      return { id, kind, item, retry, options: meaningOptions(item, allItems, lang, rng) };
    case 'basque-choice':
      return { id, kind, item, retry, options: basqueOptions(item, allItems, rng), pictureOnly: item.entry.image !== null && rng() < 0.5 };
    case 'spell':
      return { id, kind, item, retry, tiles: spellingTiles(item.entry.basque, rng) };
    case 'type-meaning':
      return { id, kind, item, retry };
  }
}

/**
 * A second, easier attempt at a word answered wrongly, with a different
 * exercise type when one is available.
 */
export function retryQuestion(question: WordQuestion, sets: HomeworkSet[], lang: Lang, rng: Rng): WordQuestion {
  const allItems = sets.flatMap(itemsOf);
  const input = { sets, lang, rng, stats: {}, today: '', mode: { kind: 'mix', setIds: [] } } satisfies RoundInput;
  const preference: WordKind[] =
    question.kind === 'meaning-choice' ? ['basque-choice', 'spell'] : question.kind === 'basque-choice' ? ['meaning-choice', 'spell'] : ['meaning-choice', 'basque-choice', 'spell'];
  const kind =
    preference.find((k) =>
      k === 'meaning-choice' ? meaningOptions(question.item, allItems, lang, rng).length >= 2 : k === 'basque-choice' ? basqueOptions(question.item, allItems, rng).length >= 2 : true,
    ) ?? 'spell';
  return wordQuestion(question.item, kind, allItems, input, `${question.id}-retry`, true);
}

/**
 * Options for "Basque → meaning". One accepted gloss of the target is shown;
 * a distractor is never another accepted gloss of the target, never an entry
 * with the same Basque term, and labels are unique ignoring case/accents.
 * Words from the same homework are preferred as distractors.
 */
export function meaningOptions(item: Item, allItems: Item[], lang: Lang, rng: Rng): Option[] {
  const accepted = meaningsOf(item.entry, lang);
  const acceptedKeys = new Set([...accepted, ...item.entry.translations.es].map(looseKey));
  const targetBasque = answerKey(item.entry.basque);
  const correct = pick(accepted, rng);

  const candidates = orderCandidates(item, allItems, rng).filter(
    (o) => answerKey(o.entry.basque) !== targetBasque && !meaningsOf(o.entry, lang).some((m) => acceptedKeys.has(looseKey(m))),
  );
  const labels = new Set([looseKey(correct)]);
  const options: Option[] = [{ label: correct, correct: true }];
  for (const candidate of candidates) {
    if (options.length >= MAX_OPTIONS) break;
    const label = pick(meaningsOf(candidate.entry, lang), rng);
    if (labels.has(looseKey(label))) continue;
    labels.add(looseKey(label));
    options.push({ label, correct: false });
  }
  return options.length >= 2 ? shuffle(options, rng) : [];
}

/**
 * Options for "meaning/picture → Basque". A distractor never shares any
 * translation with the target (it would also be a right answer).
 */
export function basqueOptions(item: Item, allItems: Item[], rng: Rng): Option[] {
  const targetMeanings = new Set([...item.entry.translations.es, ...(item.entry.translations.ru ?? [])].map(looseKey));
  const labels = new Set([answerKey(item.entry.basque)]);
  const options: Option[] = [{ label: item.entry.basque, correct: true }];
  for (const candidate of orderCandidates(item, allItems, rng)) {
    if (options.length >= MAX_OPTIONS) break;
    const key = answerKey(candidate.entry.basque);
    const meanings = [...candidate.entry.translations.es, ...(candidate.entry.translations.ru ?? [])];
    if (labels.has(key) || meanings.some((m) => targetMeanings.has(looseKey(m)))) continue;
    labels.add(key);
    options.push({ label: candidate.entry.basque, correct: false });
  }
  return options.length >= 2 ? shuffle(options, rng) : [];
}

function orderCandidates(item: Item, allItems: Item[], rng: Rng): Item[] {
  const others = allItems.filter((o) => o.key !== item.key);
  return [...shuffle(others.filter((o) => o.setId === item.setId), rng), ...shuffle(others.filter((o) => o.setId !== item.setId), rng)];
}

/** Letter tiles for spelling, or null for long terms (typed instead). */
export function spellingTiles(basque: string, rng: Rng): string[] | null {
  const letters = Array.from(basque.toLocaleLowerCase('es')).filter((c) => c !== ' ' && c !== '-');
  if (letters.length > MAX_TILE_LETTERS || letters.length === 0) return null;
  let tiles = shuffle(letters, rng);
  for (let i = 0; i < 5 && letters.length > 1 && tiles.join('') === letters.join(''); i++) tiles = shuffle(letters, rng);
  return tiles;
}

function buildOrderQuestion(sets: HomeworkSet[], rng: Rng): OrderQuestion | null {
  const candidates = sets.flatMap((set) =>
    set.groups
      .filter((g) => g.ordered)
      .map((group) => ({ set, group, items: itemsOf(set).filter((i) => i.entry.group === group.key) }))
      .filter((c) => c.items.length >= 3),
  );
  if (candidates.length === 0) return null;
  const { set, group, items } = pick(candidates, rng);
  const run = Math.min(ORDER_RUN, items.length);
  const start = Math.floor(rng() * (items.length - run + 1));
  const selected = items.slice(start, start + run);
  let shuffled = shuffle(selected, rng);
  for (let i = 0; i < 5 && shuffled.every((it, idx) => it === selected[idx]); i++) shuffled = shuffle(selected, rng);
  if (shuffled.every((it, idx) => it === selected[idx])) shuffled = [...selected].reverse();
  return { id: `order-${group.key}`, kind: 'order', setId: set.id, group, items: selected, shuffled };
}

/** Avoids asking the same word twice in a row where possible. */
function spreadRepeats(questions: WordQuestion[]): WordQuestion[] {
  const result = [...questions];
  for (let i = 1; i < result.length; i++) {
    if (result[i]!.item.key !== result[i - 1]!.item.key) continue;
    const swap = result.findIndex((q, j) => j > i && q.item.key !== result[i - 1]!.item.key && (j + 1 >= result.length || result[j + 1]!.item.key !== result[i]!.item.key));
    if (swap > 0) [result[i], result[swap]] = [result[swap]!, result[i]!];
  }
  return result;
}

export function starsFor(firstTryCorrect: number, total: number): number {
  if (total === 0) return 0;
  const ratio = firstTryCorrect / total;
  return ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
}
