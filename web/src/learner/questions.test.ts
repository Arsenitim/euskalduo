import { describe, expect, it } from 'vitest';
import { sampleSet, tinySet } from './fixtures.test-helper';
import { looseKey } from './normalize';
import { entryKey } from './progress';
import {
  basqueOptions,
  buildRound,
  checkSentence,
  grammarOptions,
  hintLength,
  itemsOf,
  meaningOptions,
  pickBalanced,
  pointsFor,
  retryPosition,
  retryQuestion,
  sentenceTiles,
  starsFor,
  type Item,
  type OrderQuestion,
  type Question,
  type RoundInput,
  type WordQuestion,
} from './questions';
import { LESSON } from './lessonConfig';
import { emptyState } from './progress';
import { seeded } from './random';
import { recordAnswer, selectionWeight, type EntryStats } from './scheduler';
import type { Story } from '../types';

const TODAY = '2026-09-23';
const hiztegia = sampleSet('hiztegia-1-gaia.json', 'hiztegia', '2026-09-21');
const calendar = sampleSet('hilabeteak-eta-astegunak.json', 'calendar', '2026-09-14');

const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
const words = (qs: Question[]) => qs.filter((q): q is WordQuestion => q.kind !== 'order' && q.kind !== 'story');

function round(partial: Partial<RoundInput> & Pick<RoundInput, 'sets' | 'mode'>, seed: number): Question[] {
  return buildRound({ stats: {}, today: TODAY, lang: 'es', rng: seeded(seed), ...partial });
}

function item(set: typeof hiztegia, basque: string): Item {
  const found = itemsOf(set).find((i) => i.entry.basque === basque);
  if (!found) throw new Error(basque);
  return found;
}

describe('multiple-choice options', () => {
  it('never shows two accepted glosses of the same handout word', () => {
    const all = itemsOf(hiztegia);
    for (const seed of seeds.slice(0, 40)) {
      for (const target of all) {
        const options = meaningOptions(target, all, 'es', seeded(seed));
        const accepted = new Set(target.entry.translations.es.map(looseKey));
        expect(options.filter((o) => o.correct)).toHaveLength(1);
        expect(options.filter((o) => accepted.has(looseKey(o.label)))).toHaveLength(1);
        expect(new Set(options.map((o) => looseKey(o.label))).size).toBe(options.length);
      }
    }
  });

  it('shows each alternative gloss individually, never joined with commas', () => {
    const labels = new Set<string>();
    for (const seed of seeds) {
      const correct = meaningOptions(item(hiztegia, 'Txapelketa'), itemsOf(hiztegia), 'es', seeded(seed)).find((o) => o.correct);
      labels.add(correct!.label);
    }
    expect([...labels].sort()).toEqual(['campeonato', 'concurso']);
  });

  it('excludes words that share a meaning or the same Basque term, even across weeks', () => {
    const older = tinySet('older', '2026-09-07', [
      ['Batela', ['barca']],
      ['Txalupa', ['chalupa']],
      ['Etxea', ['casa']],
    ]);
    const all = [...itemsOf(hiztegia), ...itemsOf(older)];
    const target = item(hiztegia, 'Txalupa');
    for (const seed of seeds.slice(0, 60)) {
      const basque = basqueOptions(target, all, seeded(seed)).map((o) => o.label);
      expect(basque).not.toContain('Batela');
      expect(basque.filter((b) => b === 'Txalupa')).toHaveLength(1);
      const meanings = meaningOptions(target, all, 'es', seeded(seed));
      expect(meanings.filter((o) => !o.correct).map((o) => o.label)).not.toContain('chalupa');
    }
  });

  it('uses Russian glosses when chosen and available', () => {
    const options = meaningOptions(item(hiztegia, 'Hiria'), itemsOf(hiztegia), 'ru', seeded(3));
    expect(options.find((o) => o.correct)!.label).toBe('город');
  });
});

describe('small sets', () => {
  it('a single-word homework with nothing else published still makes a spelling-only round', () => {
    const solo = tinySet('solo', '2026-09-21', [['Ahaztu', ['olvidar']]]);
    for (const seed of seeds.slice(0, 30)) {
      const qs = words(round({ sets: [solo], mode: { kind: 'collection', setId: 'solo' } }, seed));
      expect(qs).toHaveLength(3);
      expect(qs.every((q) => q.kind === 'spell' || q.kind === 'type-meaning')).toBe(true);
    }
  });

  it('a two-word homework offers exactly two options and alternates question types', () => {
    const pair = tinySet('pair', '2026-09-21', [
      ['Legatza', ['merluza']],
      ['Hiria', ['ciudad']],
    ]);
    for (const seed of seeds.slice(0, 30)) {
      const qs = words(round({ sets: [pair], mode: { kind: 'collection', setId: 'pair' } }, seed));
      expect(qs).toHaveLength(4);
      for (const q of qs) {
        if (q.kind === 'meaning-choice' || q.kind === 'basque-choice') expect(q.options).toHaveLength(2);
      }
      for (let i = 1; i < qs.length; i++) expect(qs[i]!.item.key).not.toBe(qs[i - 1]!.item.key);
      const kindsPerWord = new Map<string, string[]>();
      qs.forEach((q) => kindsPerWord.set(q.item.key, [...(kindsPerWord.get(q.item.key) ?? []), q.kind]));
      const variedWords = [...kindsPerWord.values()].filter((k) => new Set(k).size === k.length).length;
      expect(variedWords).toBeGreaterThanOrEqual(1);
    }
  });

  it('an empty selection produces no round', () => {
    expect(round({ sets: [hiztegia], mode: { kind: 'exam', setIds: [] } }, 1)).toEqual([]);
    expect(round({ sets: [], mode: { kind: 'lesson' } }, 1)).toEqual([]);
  });
});

describe('topic and sheet practice', () => {
  const allDue: Record<string, EntryStats> = Object.fromEntries(
    itemsOf(calendar).map((i) => [i.key, recordAnswer(recordAnswer(undefined, 'correct', '2026-09-01'), 'correct', '2026-09-02')]),
  );

  it('keeps the chosen homework as the main focus; old due words fill at most two slots', () => {
    for (const seed of seeds) {
      const qs = words(round({ sets: [hiztegia, calendar], mode: { kind: 'collection', setId: 'hiztegia' }, stats: allDue }, seed));
      const fromWeek = qs.filter((q) => q.item.setId === 'hiztegia').length;
      expect(qs).toHaveLength(10);
      expect(qs.length - fromWeek).toBeLessThanOrEqual(2);
    }
  });

  it('only reviews older words that were practised before and are due', () => {
    for (const seed of seeds.slice(0, 50)) {
      const qs = words(round({ sets: [hiztegia, calendar], mode: { kind: 'collection', setId: 'hiztegia' } }, seed));
      expect(qs.every((q) => q.item.setId === 'hiztegia')).toBe(true);
    }
  });

  it('brings a word missed last time back in nearly every round', () => {
    const missedKey = entryKey('hiztegia', item(hiztegia, 'Aspergarria').entry.id);
    const stats: Record<string, EntryStats> = {};
    // Everything practised and resting, except one word the child missed today.
    for (const i of itemsOf(hiztegia)) stats[i.key] = recordAnswer(recordAnswer(undefined, 'correct', TODAY), 'correct', TODAY);
    stats[missedKey] = recordAnswer(stats[missedKey], 'wrong', TODAY);
    const hits = seeds.filter((seed) =>
      words(round({ sets: [hiztegia], mode: { kind: 'collection', setId: 'hiztegia' }, stats }, seed)).some((q) => q.item.key === missedKey),
    ).length;
    expect(hits / seeds.length).toBeGreaterThan(0.9);
  });

  it('adds one ordering task for ordered groups, in true source order', () => {
    const qs = round({ sets: [calendar], mode: { kind: 'collection', setId: 'calendar' } }, 7);
    const orders = qs.filter((q): q is OrderQuestion => q.kind === 'order');
    expect(orders).toHaveLength(1);
    const order = orders[0]!;
    const keys = (list: Item[]) => list.map((i) => i.key);
    const groupKeys = keys(itemsOf(calendar).filter((i) => i.entry.group === order.group.key));
    const start = groupKeys.indexOf(order.items[0]!.key);
    expect(keys(order.items)).toEqual(groupKeys.slice(start, start + order.items.length));
    expect(keys(order.shuffled)).not.toEqual(keys(order.items));
    expect(keys(order.shuffled).sort()).toEqual(keys(order.items).sort());
    expect(qs).toHaveLength(10);
  });

  it('works without pictures: every question is answerable from text', () => {
    for (const seed of seeds.slice(0, 30)) {
      for (const q of words(round({ sets: [calendar], mode: { kind: 'collection', setId: 'calendar' } }, seed))) {
        if (q.kind === 'basque-choice') expect(q.pictureOnly).toBe(false);
      }
    }
  });
});

describe('exam mode', () => {
  it('draws only from the exam set, even when old words from other sets are due', () => {
    const allDue: Record<string, EntryStats> = Object.fromEntries(
      itemsOf(calendar).map((i) => [i.key, recordAnswer(recordAnswer(undefined, 'correct', '2026-09-01'), 'correct', '2026-09-02')]),
    );
    for (const seed of seeds.slice(0, 50)) {
      const qs = words(round({ sets: [hiztegia, calendar], mode: { kind: 'exam', setIds: ['hiztegia'] }, stats: allDue }, seed));
      expect(qs).toHaveLength(10);
      expect(qs.every((q) => q.item.setId === 'hiztegia')).toBe(true);
    }
  });

  it('keeps practising words that are learned and not yet due again', () => {
    // Every word freshly answered right today: week mode would rest them, the exam must not.
    const rested: Record<string, EntryStats> = Object.fromEntries(
      itemsOf(hiztegia).map((i) => [i.key, [1, 2, 3].reduce((s: EntryStats | undefined) => recordAnswer(s, 'correct', TODAY), undefined)!]),
    );
    const asked = new Set<string>();
    for (const seed of seeds.slice(0, 30)) {
      for (const q of words(round({ sets: [hiztegia], mode: { kind: 'exam', setIds: ['hiztegia'] }, stats: rested }, seed))) asked.add(q.item.key);
    }
    expect(asked.size).toBeGreaterThan(itemsOf(hiztegia).length / 2);
  });
});

describe('lessons (Empezar)', () => {
  const third = tinySet('third', null, [
    ['Etxea', ['casa']],
    ['Katua', ['gato']],
    ['Txakurra', ['perro']],
  ]);
  const topic = { ...calendar, id: 'months-topic', kind: 'topic' as const };

  it('draws from every former week and topic, without choosing anything', () => {
    const seen = new Set<string>();
    for (const seed of seeds) {
      const qs = round({ sets: [hiztegia, calendar, third, topic], mode: { kind: 'lesson' } }, seed);
      expect(qs.length).toBeLessThanOrEqual(LESSON.length);
      expect(qs.length).toBeGreaterThanOrEqual(LESSON.minLength);
      for (const q of words(qs)) seen.add(q.item.setId);
    }
    expect(seen).toEqual(new Set(['hiztegia', 'calendar', 'third', 'months-topic']));
  });

  it('never lets one collection take more than its share of word slots', () => {
    const big = { ...hiztegia, id: 'big', entries: [...hiztegia.entries, ...calendar.entries.map((e) => ({ ...e, id: `c${e.id}` }))] };
    for (const seed of seeds) {
      const picks = pickBalanced(itemsOf(big).concat(itemsOf(third)), 7, () => selectionWeight(undefined, TODAY), {}, seeded(seed));
      expect(picks.filter((i) => i.setId === 'big').length).toBeLessThanOrEqual(LESSON.maxPerCollection);
    }
  });

  it('favours mistakes and due words over resting ones', () => {
    const stats: Record<string, EntryStats> = {};
    const all = itemsOf(hiztegia);
    // Everything learned and resting…
    for (const i of all) stats[i.key] = [1, 2, 3, 4].reduce((s: EntryStats | undefined) => recordAnswer(s, 'correct', TODAY), undefined)!;
    // …except three mistakes from today.
    const weak = all.slice(0, 3).map((i) => i.key);
    for (const key of weak) stats[key] = recordAnswer(stats[key], 'wrong', TODAY);
    let weakHits = 0;
    let restingHits = 0;
    for (const seed of seeds) {
      for (const q of words(round({ sets: [hiztegia], mode: { kind: 'lesson' }, stats }, seed))) {
        if (weak.includes(q.item.key)) weakHits++;
        else restingHits++;
      }
    }
    // Each weak word comes up in nearly every lesson, each resting word in far fewer.
    expect(weakHits / 3 / seeds.length).toBeGreaterThan(0.85);
    expect(weakHits / 3).toBeGreaterThan((restingHits / 23) * 2.5);
    // Well-known words still come back now and then.
    expect(restingHits).toBeGreaterThan(0);
  });

  it('introduces unseen words gradually', () => {
    const stats: Record<string, EntryStats> = {};
    for (const i of itemsOf(calendar)) stats[i.key] = recordAnswer(undefined, 'correct', '2026-09-01');
    for (const seed of seeds.slice(0, 60)) {
      const picks = pickBalanced([...itemsOf(calendar), ...itemsOf(hiztegia)], 8, (i) => selectionWeight(stats[i.key], TODAY), stats, seeded(seed));
      const fresh = picks.filter((i) => !stats[i.key]).length;
      expect(fresh).toBeLessThanOrEqual(Math.ceil(8 * LESSON.maxNewShare));
    }
  });

  it('does not ask the same Basque word from two sheets in one lesson, and keeps their progress apart', () => {
    const copy = { ...third, id: 'copy' };
    for (const seed of seeds.slice(0, 60)) {
      const picks = pickBalanced([...itemsOf(third), ...itemsOf(copy)], 3, () => 1, {}, seeded(seed));
      expect(new Set(picks.map((i) => i.entry.basque)).size).toBe(picks.length);
    }
    expect(itemsOf(third)[0]!.key).not.toBe(itemsOf(copy)[0]!.key);
  });

  it('varies exercise types and does not need every type every time', () => {
    const kinds = new Set<string>();
    let withoutOrder = 0;
    for (const seed of seeds) {
      const qs = round({ sets: [hiztegia, calendar], mode: { kind: 'lesson' } }, seed);
      qs.forEach((q) => kinds.add(q.kind));
      if (!qs.some((q) => q.kind === 'order')) withoutOrder++;
    }
    expect([...kinds]).toEqual(expect.arrayContaining(['meaning-choice', 'basque-choice', 'spell', 'order']));
    expect(withoutOrder).toBeGreaterThan(0);
  });
});

const story = (id: string, overrides: Partial<Story> = {}): Story => ({
  id,
  title: id,
  format: 'short',
  difficulty: 1,
  transcript: 'Triku eskolara doa.',
  translations: { es: 'Triku va a la escuela.', ru: 'Трику идёт в школу.' },
  questions: [{ id: 'q1', prompt: { es: '¿Adónde?', ru: 'Куда?' }, options: [{ es: 'A la escuela', ru: 'В школу' }, { es: 'A casa', ru: 'Домой' }], correct: 0 }],
  links: { sets: [], entries: [], words: [], topics: [] },
  audio: `/audio/${'a'.repeat(64)}.mp3`,
  durationMs: 30000,
  ...overrides,
});

describe('listening inside lessons', () => {
  const lesson = (seed: number, stories: Story[], learner = emptyState()) => round({ sets: [hiztegia, calendar], mode: { kind: 'lesson' }, stories, learner }, seed);

  it('replaces word slots instead of making the lesson longer', () => {
    let withStory = 0;
    for (const seed of seeds) {
      const qs = lesson(seed, [story('s1')]);
      const blocks = qs.filter((q) => q.kind === 'story');
      expect(blocks.length).toBeLessThanOrEqual(1);
      if (blocks.length === 1) {
        withStory++;
        expect(qs.length).toBe(LESSON.length - LESSON.listeningSlots + 1);
        expect(qs[0]!.kind).not.toBe('story');
      } else {
        expect(qs.length).toBe(LESSON.length);
      }
    }
    // Often, but not in every lesson.
    expect(withStory).toBeGreaterThan(seeds.length * 0.4);
    expect(withStory).toBeLessThan(seeds.length * 0.8);
  });

  it('never uses extended stories, too-hard stories or one just heard', () => {
    const learner = emptyState();
    learner.stories['recent'] = { plays: 1, completed: 1, correct: 1, answered: 1, supported: 0, passes: 1, last: TODAY };
    const stories = [story('long', { format: 'extended' }), story('hard', { difficulty: 3 }), story('recent')];
    for (const seed of seeds.slice(0, 80)) expect(lesson(seed, stories, learner).some((q) => q.kind === 'story')).toBe(false);
  });

  it('offers a harder story only when the learner knows enough of its words', () => {
    const learner = emptyState();
    // Two stories understood: level 2.
    for (const id of ['a', 'b']) learner.stories[id] = { plays: 1, completed: 1, correct: 1, answered: 1, supported: 0, passes: 1, last: '2026-09-01' };
    const linked = story('medium', { difficulty: 2, links: { sets: [], entries: [], words: ['Legatza', 'Hiria'], topics: [] } });
    expect(seeds.slice(0, 60).some((seed) => lesson(seed, [linked], learner).some((q) => q.kind === 'story'))).toBe(false);
    for (const i of itemsOf(hiztegia).filter((i) => ['Legatza', 'Hiria'].includes(i.entry.basque))) learner.entries[i.key] = recordAnswer(undefined, 'wrong', '2026-09-01');
    expect(seeds.slice(0, 60).some((seed) => lesson(seed, [linked], learner).some((q) => q.kind === 'story'))).toBe(true);
  });

  it('puts a retry after a story block, never right before it', () => {
    const qs: Question[] = [...words(round({ sets: [hiztegia], mode: { kind: 'collection', setId: 'hiztegia' } }, 3)).slice(0, 5)];
    qs.splice(3, 0, { id: 'story-x', kind: 'story', story: story('x'), optionOrder: [[0, 1]] });
    expect(retryPosition(qs, 0)).toBe(4);
    expect(retryPosition(qs, 1)).toBe(4);
    expect(retryPosition(qs, 4)).toBe(qs.length);
  });
});

describe('sentence building and grammar', () => {
  const sentences = sampleSet('topics/esaldiak.json', 'esaldiak');
  const grammar = sampleSet('topics/gramatika.json', 'gramatika');
  const entry = (set: typeof sentences, id: string) => set.entries.find((e) => e.id === id)!;

  it('accepts the curated order and listed alternatives, nothing else', () => {
    const gaur = entry(sentences, 'gaur-astelehena');
    expect(checkSentence(gaur, ['gaur', 'astelehena', 'da', '.'])).toBe(true);
    expect(checkSentence(gaur, ['astelehena', 'da', 'gaur', '.'])).toBe(true);
    expect(checkSentence(gaur, ['da', 'gaur', 'astelehena', '.'])).toBe(false);
    expect(checkSentence(gaur, ['gaur', 'astelehena', 'naiz', '.'])).toBe(false);
  });

  it('handles repeated tiles: identical tiles are interchangeable', () => {
    const ere = entry(sentences, 'gu-ere-zuek-ere');
    for (const seed of seeds.slice(0, 20)) {
      const tiles = sentenceTiles(ere, seeded(seed));
      expect(tiles.filter((t) => t === 'ere')).toHaveLength(2);
      expect([...tiles].sort()).toEqual([...ere.sentence!.tiles].sort());
    }
    expect(checkSentence(ere, ere.sentence!.tiles)).toBe(true);
  });

  it('shuffles tiles out of order and adds the curated extra tiles', () => {
    const gaur = entry(sentences, 'gaur-astelehena');
    for (const seed of seeds.slice(0, 40)) {
      const tiles = sentenceTiles(gaur, seeded(seed));
      expect(tiles).toContain('naiz');
      expect(checkSentence(gaur, tiles.slice(0, 4))).toBe(false);
    }
  });

  it('offers one accepted answer and curated wrong ones for a gap', () => {
    const naiz = entry(grammar, 'ni-naiz');
    for (const seed of seeds.slice(0, 20)) {
      const options = grammarOptions(naiz, seeded(seed));
      expect(options.filter((o) => o.correct).map((o) => o.label)).toEqual(['naiz']);
      expect(options.map((o) => o.label).sort()).toEqual(['da', 'gara', 'naiz']);
    }
  });

  it('appears in topic practice and, at most twice, in lessons — but never as word distractors', () => {
    const qs = round({ sets: [sentences], mode: { kind: 'collection', setId: 'esaldiak' } }, 4);
    expect(qs.every((q) => q.kind === 'sentence-build')).toBe(true);
    let structured = 0;
    for (const seed of seeds) {
      const lesson = round({ sets: [hiztegia, sentences, grammar], mode: { kind: 'lesson' } }, seed);
      const count = lesson.filter((q) => q.kind === 'sentence-build' || q.kind === 'grammar-choice').length;
      expect(count).toBeLessThanOrEqual(LESSON.maxStructured);
      structured += count;
      for (const q of words(lesson)) {
        if (q.kind === 'meaning-choice' || q.kind === 'basque-choice') {
          const sentenceLabels = [...sentences.entries, ...grammar.entries].flatMap((e) => [e.basque, ...e.translations.es]);
          expect(q.options.filter((o) => !o.correct).some((o) => sentenceLabels.includes(o.label))).toBe(false);
        }
      }
    }
    expect(structured).toBeGreaterThan(seeds.length);
  });

  it('retries a missed sentence as the same activity', () => {
    const q = words(round({ sets: [grammar], mode: { kind: 'collection', setId: 'gramatika' } }, 2))[0]!;
    const retry = retryQuestion(q, [grammar], 'es', seeded(1));
    expect(retry.kind).toBe('grammar-choice');
    expect(retry.retry).toBe(true);
  });
});

describe('retries', () => {
  it('asks a missed word again with a different exercise type', () => {
    const qs = words(round({ sets: [hiztegia], mode: { kind: 'collection', setId: 'hiztegia' } }, 11));
    for (const q of qs) {
      const retry = retryQuestion(q, [hiztegia], 'es', seeded(5));
      expect(retry.item).toBe(q.item);
      expect(retry.retry).toBe(true);
      expect(retry.kind).not.toBe(q.kind === 'type-meaning' ? 'type-meaning' : q.kind);
    }
  });
});

describe('spelling hints and scoring', () => {
  it('fills the first third of a word, never all of it', () => {
    expect([1, 2, 3, 6, 7, 9, 10].map(hintLength)).toEqual([0, 1, 1, 2, 3, 3, 4]);
  });

  it('gives full, half or no credit, and stars follow the points', () => {
    expect([pointsFor(true, false), pointsFor(true, true), pointsFor(false, true), pointsFor(false, false)]).toEqual([1, 0.5, 0, 0]);
    // 8 on their own + 2 with a hint out of 10 = 9 points → 3 stars; 5 + 4 hints = 7 → 2 stars.
    expect(starsFor(8 + 2 * 0.5 + 0, 10)).toBe(3);
    expect(starsFor(5 + 4 * 0.5, 10)).toBe(2);
  });
});

describe('word formation', () => {
  const week = sampleSet('weeks/2026-10-05-hitz-motak.json', 'october5', '2026-10-05');
  const topic = sampleSet('topics/hitz-motak.json', 'formation');

  it('always practises both compounds and suffixes in sheet and topic practice', () => {
    for (const set of [week, topic]) {
      for (const seed of seeds) {
        const qs = round({ sets: [set], mode: { kind: 'collection', setId: set.id } }, seed);
        expect(qs).toHaveLength(10);
        const builds = qs.filter((q) => q.kind === 'word-build');
        expect(builds.map((q) => q.item.entry.formation!.kind).sort()).toEqual(['compound', 'derived']);
        for (const q of builds) {
          expect(q.options.filter((o) => o.correct).map((o) => o.label)).toEqual([q.item.entry.formation!.parts[1]]);
          expect(q.options.length).toBeGreaterThanOrEqual(2);
          expect(new Set(q.options.map((o) => o.label)).size).toBe(q.options.length);
          if (q.item.entry.formation!.kind === 'derived') expect(q.options.every((o) => o.label.startsWith('-'))).toBe(true);
          const retry = retryQuestion(q, [set], 'es', seeded(seed));
          expect(retry.item.key).toBe(q.item.key);
          expect(retry.retry).toBe(true);
          expect(retry.kind).not.toBe('word-build');
        }
      }
    }
  });

  it('adds at most one word-building question to a lesson, and not every time', () => {
    let some = 0;
    for (const seed of seeds) {
      const builds = round({ sets: [topic, hiztegia], mode: { kind: 'lesson' } }, seed).filter((q) => q.kind === 'word-build').length;
      expect(builds).toBeLessThanOrEqual(1);
      some += builds;
    }
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(seeds.length);
  });

  it('does not build a choice with no distractors or invent morphology for ordinary vocabulary', () => {
    const one = { ...topic, entries: [topic.entries[0]!] };
    expect(round({ sets: [one], mode: { kind: 'collection', setId: one.id } }, 1).some((q) => q.kind === 'word-build')).toBe(false);
    expect(round({ sets: [hiztegia], mode: { kind: 'collection', setId: hiztegia.id } }, 1).some((q) => q.kind === 'word-build')).toBe(false);
  });
});
