import { describe, expect, it } from 'vitest';
import { emptyState, exportProgress, importProgress, loadState, parseState, saveState, STORAGE_KEY } from './progress';
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
    const state = { ...emptyState(), displayName: 'Ane', entries: { 's1/e1': recordAnswer(undefined, true, '2026-09-23') } };
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
    const good = recordAnswer(undefined, false, '2026-09-23');
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

  it('exports and imports progress for moving to another device', () => {
    const state = { ...emptyState(), lang: 'ru' as const, sets: { s1: { rounds: 1, bestStars: 2, last: '2026-09-23' } } };
    expect(importProgress(exportProgress(state))).toEqual(state);
    expect(importProgress(JSON.stringify({ schemaVersion: 1, title: 'homework' }))).toBeNull();
    expect(importProgress('garbage')).toBeNull();
  });
});
