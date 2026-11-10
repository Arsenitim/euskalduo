import { describe, expect, it } from 'vitest';
import { emptyState, exportProgress, importProgress, loadState, parseState, recordSkill, saveState, STORAGE_KEY } from './progress';
import { recordAnswer } from './scheduler';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('learner progress storage', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const state = { ...emptyState(), displayName: 'Ane', entries: { 's1/e1': recordAnswer(undefined, 'correct', '2026-09-23') } };
    saveState(state, storage);
    expect(loadState(storage)).toEqual(state);
  });

  it('falls back to an empty state for corrupt or foreign data', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadState(storage)).toEqual(emptyState());
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(loadState(storage)).toEqual(emptyState());
  });

  it('drops invalid records individually', () => {
    const good = recordAnswer(undefined, 'wrong', '2026-09-23');
    const state = parseState({
      version: 1,
      displayName: 'x'.repeat(500),
      lang: 'fr',
      entries: { 's1/e1': good, 's1/e2': { ...good, box: 9 }, '__proto__': good, 'bad key': good },
      sets: { s1: { rounds: 2, bestStars: 3, last: '2026-09-23' }, s2: { rounds: -1, bestStars: 1, last: 'x' } },
    });
    expect(state?.displayName).toHaveLength(40);
    expect(state?.lang).toBe('es');
    expect(Object.keys(state!.entries)).toEqual(['s1/e1']);
    expect(Object.keys(state!.sets)).toEqual(['s1']);
  });

  it('keeps sound on by default and remembers turning it off', () => {
    expect(emptyState().sound).toBe(true);
    expect(parseState({ version: 1 })?.sound).toBe(true);
    expect(parseState({ version: 1, sound: false })?.sound).toBe(false);
    expect(parseState({ version: 1, sound: 'loud' })?.sound).toBe(true);
  });

  it('exports and imports progress for moving to another device', () => {
    const state = { ...emptyState(), lang: 'ru' as const, sets: { s1: { rounds: 1, bestStars: 2, last: '2026-09-23' } } };
    expect(importProgress(exportProgress(state))).toEqual(state);
    expect(importProgress(JSON.stringify({ schemaVersion: 1, title: 'homework' }))).toBeNull();
    expect(importProgress('garbage')).toBeNull();
  });

  it('migrates version 1 progress without losing any record, and repeating it changes nothing', () => {
    const box = recordAnswer(recordAnswer(undefined, 'correct', '2026-09-20'), 'correct', '2026-09-21');
    const v1 = {
      version: 1,
      displayName: 'Ane',
      lang: 'ru',
      sound: false,
      pinnedWeek: 's1',
      entries: { 's1/e1': box, 's2/e9': recordAnswer(undefined, 'wrong', '2026-09-22') },
      sets: { s1: { rounds: 4, bestStars: 3, last: '2026-09-21' } },
    };
    const v2 = parseState(v1)!;
    expect(v2.version).toBe(2);
    expect(v2.entries).toEqual(v1.entries);
    expect(v2.sets).toEqual(v1.sets);
    expect([v2.displayName, v2.lang, v2.sound]).toEqual(['Ane', 'ru', false]);
    expect(v2).not.toHaveProperty('pinnedWeek');
    expect(v2.skills).toEqual({});
    expect(v2.stories).toEqual({});
    // Repeatable: parsing the migrated state (as on the next start) gives the same.
    expect(parseState(JSON.parse(JSON.stringify(v2)))).toEqual(v2);

    // An old export file still loads.
    const oldExport = JSON.stringify({ app: 'euskalduo', kind: 'learner-progress', exportedAt: '2026-10-01T10:00:00Z', state: v1 });
    expect(importProgress(oldExport)).toEqual(v2);
  });

  it('keeps word skills and listening records separate and validated', () => {
    const today = '2026-11-10';
    const skill = recordSkill(recordSkill(undefined, true, today), true, today);
    expect(skill).toEqual({ seen: 2, correct: 2, streak: 2, last: today });
    expect(recordSkill(skill, false, today).streak).toBe(0);
    const story = { plays: 2, completed: 1, correct: 2, answered: 3, supported: 1, passes: 0, last: today };
    const state = parseState({
      version: 2,
      skills: { 's1/e1': { spelling: skill, recognition: { seen: 1, correct: 5, streak: 0, last: today } }, bad: { spelling: skill } },
      stories: { 'triku-1': story, 'x y': story, broken: { ...story, correct: 9 } },
    })!;
    expect(state.skills).toEqual({ 's1/e1': { spelling: skill } });
    expect(state.stories).toEqual({ 'triku-1': story });
    expect(importProgress(exportProgress(state))).toEqual(state);
  });
});
