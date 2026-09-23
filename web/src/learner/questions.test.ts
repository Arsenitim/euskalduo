import { describe, expect, it } from 'vitest';
import { sampleSet, tinySet } from './fixtures.test-helper';
import { looseKey } from './normalize';
import { entryKey } from './progress';
import {
  basqueOptions,
  buildRound,
  itemsOf,
  meaningOptions,
  retryQuestion,
  type Item,
  type OrderQuestion,
  type Question,
  type RoundInput,
  type WordQuestion,
} from './questions';
import { seeded } from './random';
import { recordAnswer, type EntryStats } from './scheduler';

const TODAY = '2026-09-23';
const hiztegia = sampleSet('hiztegia-1-gaia.json', 'hiztegia', '2026-09-21');
const calendar = sampleSet('hilabeteak-eta-astegunak.json', 'calendar', '2026-09-14');

const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
const words = (qs: Question[]) => qs.filter((q): q is WordQuestion => q.kind !== 'order');

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
      const qs = words(round({ sets: [solo], mode: { kind: 'week', setId: 'solo' } }, seed));
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
      const qs = words(round({ sets: [pair], mode: { kind: 'week', setId: 'pair' } }, seed));
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
    expect(round({ sets: [hiztegia], mode: { kind: 'mix', setIds: [] } }, 1)).toEqual([]);
  });
});

describe('week mode', () => {
  const allDue: Record<string, EntryStats> = Object.fromEntries(
    itemsOf(calendar).map((i) => [i.key, recordAnswer(recordAnswer(undefined, true, '2026-09-01'), true, '2026-09-02')]),
  );

  it('keeps the chosen homework as the main focus; old due words fill at most two slots', () => {
    for (const seed of seeds) {
      const qs = words(round({ sets: [hiztegia, calendar], mode: { kind: 'week', setId: 'hiztegia' }, stats: allDue }, seed));
      const fromWeek = qs.filter((q) => q.item.setId === 'hiztegia').length;
      expect(qs).toHaveLength(10);
      expect(qs.length - fromWeek).toBeLessThanOrEqual(2);
    }
  });

  it('only reviews older words that were practised before and are due', () => {
    for (const seed of seeds.slice(0, 50)) {
      const qs = words(round({ sets: [hiztegia, calendar], mode: { kind: 'week', setId: 'hiztegia' } }, seed));
      expect(qs.every((q) => q.item.setId === 'hiztegia')).toBe(true);
    }
  });

  it('brings a word missed last time back in nearly every round', () => {
    const missedKey = entryKey('hiztegia', item(hiztegia, 'Aspergarria').entry.id);
    const stats: Record<string, EntryStats> = {};
    // Everything practised and resting, except one word the child missed today.
    for (const i of itemsOf(hiztegia)) stats[i.key] = recordAnswer(recordAnswer(undefined, true, TODAY), true, TODAY);
    stats[missedKey] = recordAnswer(stats[missedKey], false, TODAY);
    const hits = seeds.filter((seed) =>
      words(round({ sets: [hiztegia], mode: { kind: 'week', setId: 'hiztegia' }, stats }, seed)).some((q) => q.item.key === missedKey),
    ).length;
    expect(hits / seeds.length).toBeGreaterThan(0.9);
  });

  it('adds one ordering task for ordered groups, in true source order', () => {
    const qs = round({ sets: [calendar], mode: { kind: 'week', setId: 'calendar' } }, 7);
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
      for (const q of words(round({ sets: [calendar], mode: { kind: 'week', setId: 'calendar' } }, seed))) {
        if (q.kind === 'basque-choice') expect(q.pictureOnly).toBe(false);
      }
    }
  });
});

describe('mix mode', () => {
  const third = tinySet('third', '2026-09-07', [
    ['Etxea', ['casa']],
    ['Katua', ['gato']],
    ['Txakurra', ['perro']],
  ]);
  const unselected = tinySet('unselected', '2026-08-31', [['Mahaia', ['mesa']]]);

  it('samples every selected week and nothing else', () => {
    for (const seed of seeds) {
      const qs = words(round({ sets: [hiztegia, calendar, third, unselected], mode: { kind: 'mix', setIds: ['hiztegia', 'calendar', 'third'] } }, seed));
      const bySet = new Set(qs.map((q) => q.item.setId));
      expect(bySet).toEqual(new Set(['hiztegia', 'calendar', 'third']));
    }
  });

  it('gives a small week a fair share instead of a share proportional to its size', () => {
    // Proportional sampling would give the 3-word week ~1 of 10 slots.
    let small = 0;
    for (const seed of seeds) {
      const qs = words(round({ sets: [hiztegia, third], mode: { kind: 'mix', setIds: ['hiztegia', 'third'] } }, seed));
      small += qs.filter((q) => q.item.setId === 'third').length;
    }
    expect(small / seeds.length).toBeGreaterThan(2.5);
  });
});

describe('retries', () => {
  it('asks a missed word again with a different exercise type', () => {
    const qs = words(round({ sets: [hiztegia], mode: { kind: 'week', setId: 'hiztegia' } }, 11));
    for (const q of qs) {
      const retry = retryQuestion(q, [hiztegia], 'es', seeded(5));
      expect(retry.item).toBe(q.item);
      expect(retry.retry).toBe(true);
      expect(retry.kind).not.toBe(q.kind === 'type-meaning' ? 'type-meaning' : q.kind);
    }
  });
});
