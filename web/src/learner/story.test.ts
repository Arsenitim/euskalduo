import { describe, expect, it } from 'vitest';
import { sampleSet } from './fixtures.test-helper';
import { emptyState } from './progress';
import { itemsOf, starsFor } from './questions';
import { legacyRedirect } from './routes';
import { recordAnswer } from './scheduler';
import { familiarity, isPass, listeningLevel, recordStory, recommendStory, storyPoints, storyState, type StoryResult } from './story';
import type { Story } from '../types';

const TODAY = '2026-11-10';
const story = (overrides: Partial<Story> = {}): Story => ({
  id: 's1',
  title: 'S',
  format: 'short',
  difficulty: 1,
  transcript: 'x',
  translations: { es: 'x', ru: 'x' },
  questions: [],
  links: { sets: [], entries: [], words: [], topics: [] },
  audio: `/audio/${'b'.repeat(64)}.mp3`,
  durationMs: 30000,
  ...overrides,
});
const done = (answers: boolean[], supported = false): StoryResult => ({ status: 'done', answers, supported });

describe('story scoring', () => {
  it('scores the whole block as one question; the text before answering halves it', () => {
    expect(storyPoints(done([true, true]))).toBe(1);
    expect(storyPoints(done([true, false]))).toBe(0.5);
    expect(storyPoints(done([true, true], true))).toBe(0.5);
    // One story among 7 other perfect questions cannot sink the stars.
    expect(starsFor(7 + storyPoints(done([false, false]))!, 8)).toBe(2);
  });

  it('does not score skipped or unplayable stories, and does not record a technical failure', () => {
    expect(storyPoints({ status: 'skipped', answers: [], supported: false })).toBeNull();
    expect(storyPoints({ status: 'unavailable', answers: [], supported: false })).toBeNull();
    expect(recordStory(undefined, { status: 'unavailable', answers: [], supported: false }, TODAY)).toBeUndefined();
    expect(recordStory(undefined, { status: 'skipped', answers: [], supported: false }, TODAY)).toMatchObject({ plays: 1, completed: 0 });
  });

  it('counts a pass only when understood without the text', () => {
    expect(isPass(done([true, true]))).toBe(true);
    expect(isPass(done([true, false]))).toBe(false);
    expect(isPass(done([true, true, true, false]))).toBe(true);
    expect(isPass(done([true, true], true))).toBe(false);
    const stats = recordStory(recordStory(undefined, done([true, true], true), TODAY), done([true, true]), TODAY)!;
    expect(stats).toEqual({ plays: 2, completed: 2, correct: 4, answered: 4, supported: 1, passes: 1, last: TODAY });
    expect(storyState(stats)).toBe('understood');
    expect(storyState(recordStory(undefined, done([true], true), TODAY))).toBe('supported');
  });

  it('raises the listening level with understood stories', () => {
    const state = emptyState();
    expect(listeningLevel(state)).toBe(1);
    for (const id of ['a', 'b']) state.stories[id] = { plays: 1, completed: 1, correct: 1, answered: 1, supported: 0, passes: 1, last: TODAY };
    expect(listeningLevel(state)).toBe(2);
  });

  it('judges familiarity from practised words, never from story results', () => {
    const sheet = sampleSet('hiztegia-1-gaia.json', 'h');
    const linked = story({ links: { sets: [], entries: [], words: ['Legatza', 'Hiria', 'Txalupa', 'Igerilekua'], topics: [] } });
    const state = emptyState();
    expect(familiarity(linked, state, [sheet])).toBe(0);
    for (const i of itemsOf(sheet).filter((i) => ['Legatza', 'Hiria'].includes(i.entry.basque))) state.entries[i.key] = recordAnswer(undefined, 'wrong', TODAY);
    expect(familiarity(linked, state, [sheet])).toBe(0.5);
    // A wrong listening answer leaves the words' boxes alone: recordStory only returns story stats.
    const before = JSON.stringify(state.entries);
    recordStory(undefined, done([false]), TODAY);
    expect(JSON.stringify(state.entries)).toBe(before);
  });

  it('recommends a fresh suitable story, else the easiest', () => {
    const state = emptyState();
    state.stories['heard'] = { plays: 1, completed: 1, correct: 1, answered: 1, supported: 0, passes: 1, last: TODAY };
    expect(recommendStory([story({ id: 'heard' }), story({ id: 'fresh' })], state, [], TODAY)?.id).toBe('fresh');
    expect(recommendStory([story({ id: 'hard', difficulty: 3 })], state, [], TODAY)?.id).toBe('hard');
    expect(recommendStory([], state, [], TODAY)).toBeNull();
  });
});

describe('old links', () => {
  it('send week-era routes to their replacements', () => {
    expect(legacyRedirect('/semanas', '')).toBe('/temas');
    expect(legacyRedirect('/categorias', '')).toBe('/temas');
    expect(legacyRedirect('/mezclar', '')).toBe('/leccion');
    expect(legacyRedirect('/semana/s1a2', '')).toBe('/tema/s1a2');
    expect(legacyRedirect('/categoria/s9', '')).toBe('/tema/s9');
    expect(legacyRedirect('/practicar', '?modo=semana&id=s1')).toBe('/practicar?modo=tema&id=s1');
    expect(legacyRedirect('/practicar', '?modo=mezcla&ids=a,b')).toBe('/leccion');
    expect(legacyRedirect('/practicar', '?modo=tema&id=s1')).toBeNull();
    expect(legacyRedirect('/examen/s1', '')).toBeNull();
    expect(legacyRedirect('/', '')).toBeNull();
  });
});
