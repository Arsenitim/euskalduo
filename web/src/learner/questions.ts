import type { Entry, Group, HomeworkSet, Lang, Story } from '../types';
import { LESSON } from './lessonConfig';
import { answerKey, looseKey, sentenceKey } from './normalize';
import { entryKey, type LearnerState } from './progress';
import { pick, shuffle, weightedSample, type Rng } from './random';
import { examWeight, isDue, selectionWeight, type EntryStats } from './scheduler';
import { pickLessonStory, shuffledOptions } from './story';

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
  | (WordQuestionBase & { kind: 'type-meaning' })
  | (WordQuestionBase & { kind: 'word-build'; options: Option[] })
  /** Arrange curated tiles (repeats allowed) into the sentence. */
  | (WordQuestionBase & { kind: 'sentence-build'; tiles: string[] })
  /** Choose the word that fills the gap of a curated sentence. */
  | (WordQuestionBase & { kind: 'grammar-choice'; options: Option[] });

export interface OrderQuestion {
  id: string;
  kind: 'order';
  setId: string;
  group: Group;
  items: Item[];
  shuffled: Item[];
}

/** A story with its questions, answered as one block. */
export interface StoryBlock {
  id: string;
  kind: 'story';
  story: Story;
  /** Option order per question, shuffled each time. */
  optionOrder: number[][];
}

export type Question = WordQuestion | OrderQuestion | StoryBlock;
export type WordKind = WordQuestion['kind'];
type VocabularyKind = 'meaning-choice' | 'basque-choice' | 'spell' | 'type-meaning';

/**
 * lesson: the whole catalogue, chosen for the learner ("Empezar").
 * collection: one sheet or topic (plus a little due review from elsewhere).
 * exam: the sets of an exam, every item circulating regardless of the review calendar.
 */
export type Mode = { kind: 'lesson' } | { kind: 'collection'; setId: string } | { kind: 'exam'; setIds: string[] };

export const ROUND_MAX = LESSON.length;
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
  /** For lessons: published stories and the learner's state (listening history, levels). */
  stories?: Story[];
  learner?: LearnerState;
}

export function meaningsOf(entry: Entry, lang: Lang): string[] {
  const list = entry.translations[lang];
  return list && list.length > 0 ? list : entry.translations.es;
}

export function itemsOf(set: HomeworkSet): Item[] {
  return set.entries.map((entry) => ({ setId: set.id, entry, key: entryKey(set.id, entry.id) }));
}

export const isWordItem = (item: Item): boolean => (item.entry.type ?? 'word') === 'word';

/** 3 questions for a single item, up to ROUND_MAX; roughly two per item. */
export function roundLength(itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.min(ROUND_MAX, Math.max(LESSON.minLength, itemCount * 2));
}

/**
 * Builds one practice round. See docs/ARCHITECTURE.md ("Practice logic")
 * for the rules; the numbers are in lessonConfig.ts.
 */
export function buildRound(input: RoundInput): Question[] {
  const { sets, mode, stats, today, rng } = input;
  const allItems = sets.flatMap(itemsOf);
  const wordPool = allItems.filter(isWordItem);
  const weight = (item: Item) => (mode.kind === 'exam' ? examWeight(stats[item.key]) : selectionWeight(stats[item.key], today));

  const sourceSets = mode.kind === 'lesson' ? sets : sets.filter((s) => (mode.kind === 'exam' ? mode.setIds.includes(s.id) : s.id === mode.setId));
  const sourceItems = sourceSets.flatMap(itemsOf);
  let length = roundLength(sourceItems.length);
  if (length === 0) return [];

  const story = mode.kind === 'lesson' && input.stories && input.learner ? pickLessonStory(input.stories, input.learner, sets, today, rng) : null;
  if (story) length = Math.max(length, LESSON.listeningSlots + LESSON.minLength);
  let slots = length - (story ? LESSON.listeningSlots : 0);

  const order = slots >= 6 && (mode.kind !== 'lesson' || rng() < LESSON.orderChance) ? buildOrderQuestion(sourceSets, rng) : null;
  if (order) slots--;

  const used = new Set<string>();
  const usedBasque = new Set<string>();
  const take = (item: Item) => {
    used.add(item.key);
    usedBasque.add(answerKey(item.entry.basque));
  };

  // Word building: optional in lessons, one per formation type in topic practice.
  const builderKinds = mode.kind === 'lesson' ? (rng() < LESSON.wordBuildChance ? [pick(['compound', 'derived'] as const, rng)] : []) : (['compound', 'derived'] as const);
  const builders = builderKinds.flatMap((kind) => {
    const candidates = sourceItems.filter((i) => i.entry.formation?.kind === kind && formationOptions(i, sourceItems, rng).length >= 2);
    return weightedSample(candidates, weight, 1, rng);
  });
  builders.forEach(take);
  slots -= builders.length;

  let picks: Item[];
  if (mode.kind === 'lesson') {
    const structuredPool = sourceItems.filter((i) => !isWordItem(i) && structuredReady(i));
    const structuredCount = Math.min(LESSON.maxStructured, structuredPool.length, slots >= 4 ? 1 + (rng() < 0.5 ? 1 : 0) : 0);
    const structured = weightedSample(structuredPool, weight, structuredCount, rng);
    structured.forEach(take);
    slots -= structured.length;
    picks = [...structured, ...pickBalanced(wordPool.filter((i) => !used.has(i.key)), slots, weight, stats, rng, usedBasque)];
  } else {
    const reviewPool =
      mode.kind === 'collection'
        ? wordPool.filter((i) => i.setId !== mode.setId && (stats[i.key]?.seen ?? 0) > 0 && isDue(stats[i.key], today) && !usedBasque.has(answerKey(i.entry.basque)))
        : [];
    const reviewCount = Math.min(LESSON.maxReviewInCollection, Math.floor(length * 0.2), reviewPool.length);
    slots -= reviewCount;
    const own = sourceItems.filter((i) => isWordItem(i) || structuredReady(i));
    picks = [...pickWords(own, slots, weight, rng), ...weightedSample(reviewPool, weight, reviewCount, rng)];
  }

  const kinds = new Map<string, WordKind[]>();
  const questions: WordQuestion[] = picks.map((item, index) => {
    const previous = kinds.get(item.key) ?? [];
    const q = wordQuestion(item, chooseKind(item, stats[item.key], previous, wordPool, input), wordPool, input, `q${index}`, false);
    kinds.set(item.key, [...previous, q.kind]);
    return q;
  });
  questions.push(...builders.map((item, i) => wordQuestion(item, 'word-build', sourceItems, input, `build${i}`, false)));

  const arranged: Question[] = spreadRepeats(shuffle(questions, rng));
  if (order) {
    const at = Math.max(1, Math.floor(arranged.length / 2) + Math.floor(rng() * Math.ceil(arranged.length / 2)));
    arranged.splice(at, 0, order);
  }
  if (story) {
    // In the second half, after a few warm-up questions, never first.
    const at = Math.min(arranged.length, Math.max(2, Math.floor(arranged.length / 2) + Math.floor(rng() * 2)));
    arranged.splice(at, 0, { id: `story-${story.id}`, kind: 'story', story, optionOrder: shuffledOptions(story, rng) });
  }
  return arranged;
}

/** Sentence and grammar items need their curated exercise data. */
function structuredReady(item: Item): boolean {
  const { entry } = item;
  if (entry.type === 'sentence') return (entry.sentence?.tiles.length ?? 0) >= 2;
  if (entry.type === 'grammar') return (entry.grammar?.answers.length ?? 0) >= 1 && (entry.grammar?.distractors.length ?? 0) >= 1;
  return true;
}

/** Picks `slots` items, repeating items only when the pool is too small. */
function pickWords(items: Item[], slots: number, weight: (i: Item) => number, rng: Rng): Item[] {
  const result: Item[] = [];
  while (result.length < slots && items.length > 0) {
    result.push(...weightedSample(items, weight, Math.min(items.length, slots - result.length), rng));
  }
  return result;
}

/**
 * Lesson words from the whole catalogue, balanced across collections:
 * first a collection (chance ∝ total weight ^ collectionExponent, at most
 * maxPerCollection words each), then a word in it by its own weight. New
 * words fill at most maxNewShare of the slots, so unseen material arrives
 * gradually. Once a Basque spelling is picked, other occurrences of it (in
 * other sheets) are skipped for this lesson; their progress stays separate.
 */
export function pickBalanced(
  pool: Item[],
  slots: number,
  weight: (i: Item) => number,
  stats: Record<string, EntryStats>,
  rng: Rng,
  usedBasque = new Set<string>(),
): Item[] {
  const result: Item[] = [];
  const perCollection = new Map<string, number>();
  const maxNew = Math.max(1, Math.ceil(slots * LESSON.maxNewShare));
  let newCount = 0;
  let remaining = pool.filter((i) => !usedBasque.has(answerKey(i.entry.basque)));

  while (result.length < slots) {
    const allowNew = newCount < maxNew;
    const underCap = (i: Item) => (perCollection.get(i.setId) ?? 0) < LESSON.maxPerCollection;
    const notNew = (i: Item) => allowNew || (stats[i.key]?.seen ?? 0) > 0;
    // The limits give way, in this order, when the catalogue is too small for them.
    const eligible = [remaining.filter((i) => underCap(i) && notNew(i)), remaining.filter(underCap), remaining].find((list) => list.length > 0) ?? [];
    if (eligible.length === 0) break;
    const totals = new Map<string, number>();
    for (const i of eligible) totals.set(i.setId, (totals.get(i.setId) ?? 0) + weight(i));
    const [setId] = weightedSample([...totals.keys()], (id) => Math.pow(totals.get(id)!, LESSON.collectionExponent), 1, rng);
    const [chosen] = weightedSample(eligible.filter((i) => i.setId === setId), weight, 1, rng);
    if (!chosen) break;
    result.push(chosen);
    perCollection.set(chosen.setId, (perCollection.get(chosen.setId) ?? 0) + 1);
    if ((stats[chosen.key]?.seen ?? 0) === 0) newCount++;
    const basque = answerKey(chosen.entry.basque);
    remaining = remaining.filter((i) => answerKey(i.entry.basque) !== basque);
  }
  // A tiny catalogue: repeat words (each gets a different exercise type).
  if (result.length < slots && result.length > 0) result.push(...pickWords([...result], slots - result.length, weight, rng));
  return result;
}

function chooseKind(item: Item, stats: EntryStats | undefined, previous: WordKind[], wordPool: Item[], input: RoundInput): WordKind {
  if (item.entry.type === 'sentence') return 'sentence-build';
  if (item.entry.type === 'grammar') return 'grammar-choice';
  const box = stats?.box ?? 0;
  const seen = (stats?.seen ?? 0) > 0;
  const weights: Record<VocabularyKind, number> = !seen || box === 0
    ? { 'meaning-choice': 3, 'basque-choice': 2, spell: 1, 'type-meaning': 0 }
    : box <= 2
      ? { 'meaning-choice': 1, 'basque-choice': 2, spell: 2, 'type-meaning': box === 2 ? 1 : 0 }
      : { 'meaning-choice': 1, 'basque-choice': 1, spell: 2, 'type-meaning': 2 };
  if (meaningOptions(item, wordPool, input.lang, input.rng).length < 2) weights['meaning-choice'] = 0;
  if (basqueOptions(item, wordPool, input.rng).length < 2) weights['basque-choice'] = 0;
  for (const kind of previous) if (kind in weights) weights[kind as VocabularyKind] *= 0.1;
  const kinds = (Object.keys(weights) as VocabularyKind[]).filter((k) => weights[k] > 0);
  return weightedSample(kinds, (k) => weights[k], 1, input.rng)[0] ?? 'spell';
}

function wordQuestion(item: Item, kind: WordKind, pool: Item[], input: RoundInput, id: string, retry: boolean): WordQuestion {
  const { lang, rng } = input;
  const words = pool.filter(isWordItem);
  switch (kind) {
    case 'meaning-choice':
      return { id, kind, item, retry, options: meaningOptions(item, words, lang, rng) };
    case 'basque-choice':
      return { id, kind, item, retry, options: basqueOptions(item, words, rng), pictureOnly: item.entry.image !== null && rng() < 0.5 };
    case 'spell':
      return { id, kind, item, retry, tiles: spellingTiles(item.entry.basque, rng) };
    case 'type-meaning':
      return { id, kind, item, retry };
    case 'word-build':
      return { id, kind, item, retry, options: formationOptions(item, pool, rng) };
    case 'sentence-build':
      return { id, kind, item, retry, tiles: sentenceTiles(item.entry, rng) };
    case 'grammar-choice':
      return { id, kind, item, retry, options: grammarOptions(item.entry, rng) };
  }
}

/**
 * A second, easier attempt at an item answered wrongly, with a different
 * exercise type when one is available. Sentences and grammar come back as
 * the same activity (with a fresh order).
 */
export function retryQuestion(question: WordQuestion, sets: HomeworkSet[], lang: Lang, rng: Rng): WordQuestion {
  const allItems = sets.flatMap(itemsOf);
  const words = allItems.filter(isWordItem);
  const input = { sets, lang, rng, stats: {}, today: '', mode: { kind: 'lesson' } } satisfies RoundInput;
  if (question.kind === 'sentence-build' || question.kind === 'grammar-choice') {
    return wordQuestion(question.item, question.kind, allItems, input, `${question.id}-retry`, true);
  }
  const preference: WordKind[] =
    question.kind === 'meaning-choice' ? ['basque-choice', 'spell'] : question.kind === 'basque-choice' ? ['meaning-choice', 'spell'] : ['meaning-choice', 'basque-choice', 'spell'];
  const kind =
    preference.find((k) =>
      k === 'meaning-choice' ? meaningOptions(question.item, words, lang, rng).length >= 2 : k === 'basque-choice' ? basqueOptions(question.item, words, rng).length >= 2 : true,
    ) ?? 'spell';
  return wordQuestion(question.item, kind, allItems, input, `${question.id}-retry`, true);
}

/**
 * Options for "Basque → meaning". One accepted gloss of the target is shown;
 * a distractor is never another accepted gloss of the target, never an entry
 * with the same Basque term, and labels are unique ignoring case/accents.
 * Words from the same sheet are preferred as distractors.
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
  const others = allItems.filter((o) => o.key !== item.key && isWordItem(o));
  return [...shuffle(others.filter((o) => o.setId === item.setId), rng), ...shuffle(others.filter((o) => o.setId !== item.setId), rng)];
}

/** Only use curated parts of the same formation type; no invented suffixes. */
export function formationOptions(item: Item, allItems: Item[], rng: Rng): Option[] {
  const formation = item.entry.formation;
  if (!formation) return [];
  const correct = formation.parts[1];
  // Exclude alternatives taught for the same stem (both could be legitimate).
  const accepted = new Set(allItems.filter((i) => i.entry.formation?.kind === formation.kind && i.entry.formation.parts[0] === formation.parts[0]).map((i) => i.entry.formation!.parts[1]));
  const labels = [...new Set(allItems.filter((i) => i.entry.formation?.kind === formation.kind).map((i) => i.entry.formation!.parts[1]))].filter((s) => !accepted.has(s));
  return shuffle([{ label: correct, correct: true }, ...shuffle(labels, rng).slice(0, MAX_OPTIONS - 1).map((label) => ({ label, correct: false }))], rng);
}

/** Letter tiles for spelling, or null for long terms (typed instead). */
export function spellingTiles(basque: string, rng: Rng): string[] | null {
  const letters = Array.from(basque.toLocaleLowerCase('es')).filter((c) => c !== ' ' && c !== '-');
  if (letters.length > MAX_TILE_LETTERS || letters.length === 0) return null;
  let tiles = shuffle(letters, rng);
  for (let i = 0; i < 5 && letters.length > 1 && tiles.join('') === letters.join(''); i++) tiles = shuffle(letters, rng);
  return tiles;
}

/** The sentence's tiles plus its curated extra tiles, never in the right order. */
export function sentenceTiles(entry: Entry, rng: Rng): string[] {
  const exercise = entry.sentence;
  if (!exercise) return [];
  const all = [...exercise.tiles, ...exercise.distractors];
  let tiles = shuffle(all, rng);
  const accepted = acceptedSentences(entry);
  for (let i = 0; i < 8 && accepted.has(sentenceKey(tiles.slice(0, exercise.tiles.length).join(' '))); i++) tiles = shuffle(all, rng);
  return tiles;
}

/** Every accepted order, as comparison keys. Identical tiles are interchangeable. */
export function acceptedSentences(entry: Entry): Set<string> {
  const exercise = entry.sentence;
  if (!exercise) return new Set();
  return new Set([exercise.tiles, ...exercise.alternatives].map((tiles) => sentenceKey(tiles.join(' '))));
}

export function checkSentence(entry: Entry, built: string[]): boolean {
  return acceptedSentences(entry).has(sentenceKey(built.join(' ')));
}

/** One accepted answer (any of them is right) and up to three curated wrong ones. */
export function grammarOptions(entry: Entry, rng: Rng): Option[] {
  const exercise = entry.grammar;
  if (!exercise) return [];
  const wrong = shuffle(exercise.distractors, rng).slice(0, MAX_OPTIONS - 1);
  return shuffle([{ label: pick(exercise.answers, rng), correct: true }, ...wrong.map((label) => ({ label, correct: false }))], rng);
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
  return { id: `order-${set.id}-${group.key}`, kind: 'order', setId: set.id, group, items: selected, shuffled };
}

/** Avoids asking the same item (or the same Basque spelling) twice in a row where possible. */
function spreadRepeats(questions: WordQuestion[]): WordQuestion[] {
  const key = (q: WordQuestion) => answerKey(q.item.entry.basque);
  const result = [...questions];
  for (let i = 1; i < result.length; i++) {
    if (key(result[i]!) !== key(result[i - 1]!)) continue;
    const swap = result.findIndex((q, j) => j > i && key(q) !== key(result[i - 1]!) && (j + 1 >= result.length || key(result[j + 1]!) !== key(result[i]!)));
    if (swap > 0) [result[i], result[swap]] = [result[swap]!, result[i]!];
  }
  return result;
}

/**
 * Where a retry goes: `gap` questions later, but never inside or right
 * before a story block (then it goes right after the story).
 */
export function retryPosition(questions: Question[], index: number, gap: number = LESSON.retryGap): number {
  let at = Math.min(index + gap, questions.length);
  while (at < questions.length && questions[at]!.kind === 'story') at++;
  return at;
}

/**
 * Letters (or sentence tiles) the hint fills in: the first third (rounded
 * up), never all of them. A single letter or tile gets no hint.
 */
export function hintLength(letters: number): number {
  return letters <= 1 ? 0 : Math.min(letters - 1, Math.ceil(letters / 3));
}

/** Round score of a first answer: 1 on its own, ½ with a hint, 0 wrong or skipped. */
export function pointsFor(correct: boolean, hinted: boolean): number {
  return correct ? (hinted ? 0.5 : 1) : 0;
}

export function starsFor(points: number, total: number): number {
  if (total === 0) return 0;
  const ratio = points / total;
  return ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
}

/** The skill a word question exercises (sentences and grammar have their own items). */
export function skillOf(kind: WordKind): 'recognition' | 'spelling' | null {
  if (kind === 'spell') return 'spelling';
  if (kind === 'meaning-choice' || kind === 'basque-choice' || kind === 'type-meaning') return 'recognition';
  return null;
}
