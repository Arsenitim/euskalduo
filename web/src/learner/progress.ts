import type { Lang } from '../types';
import type { EntryStats } from './scheduler';

/**
 * Everything about the learner lives here, in this browser's localStorage,
 * and is never sent to the server. Keys are "<setId>/<entryId>" so edits to
 * content keep progress for unchanged entries.
 *
 * Version 2 (this release) keeps every version 1 record unchanged and adds
 * separate skill and listening records. Version 1 data (from storage or an
 * old export file) is migrated when it is read; reading version 2 data
 * again changes nothing, so the migration is safe to repeat. The storage key
 * stays the same so nothing is left behind.
 */
export const STORAGE_KEY = 'euskalduo.learner.v1';
export const STATE_VERSION = 2;

export interface SetStats {
  rounds: number;
  bestStars: number;
  last: string;
}

/** How often one skill of a word went right. Kept apart from the review box on purpose. */
export interface SkillStats {
  seen: number;
  correct: number;
  /** Right answers in a row for this skill. */
  streak: number;
  last: string;
}

/** "recognition": choosing or typing the meaning, choosing the Basque word. "spelling": writing the Basque word. */
export type WordSkill = 'recognition' | 'spelling';

export interface StoryStats {
  /** Times the story was started. */
  plays: number;
  /** Times all its questions were answered. */
  completed: number;
  /** Questions answered right / answered, over all completions. */
  correct: number;
  answered: number;
  /** Completions where the text was opened before answering. */
  supported: number;
  /** Completions understood without the text (see story.ts). */
  passes: number;
  last: string;
}

export interface LearnerState {
  version: 2;
  displayName: string;
  lang: Lang;
  /** Voice and sound effects (on by default). */
  sound: boolean;
  /** Review boxes per item (words, sentences, grammar), exactly as in version 1. */
  entries: Record<string, EntryStats>;
  /** Per-skill results of words, from version 2 on. */
  skills: Record<string, Partial<Record<WordSkill, SkillStats>>>;
  /** Listening comprehension per story id: never mixed into word boxes. */
  stories: Record<string, StoryStats>;
  /** Rounds and best stars per set (topic or sheet practice). */
  sets: Record<string, SetStats>;
}

export function emptyState(): LearnerState {
  return { version: 2, displayName: '', lang: 'es', sound: true, entries: {}, skills: {}, stories: {}, sets: {} };
}

export function entryKey(setId: string, entryId: string): string {
  return `${setId}/${entryId}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,40}$/;
const SET_ID = /^[a-z0-9_-]{1,40}$/;
const SKILLS: WordSkill[] = ['recognition', 'spelling'];

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

const isDate = (v: unknown): v is string => typeof v === 'string' && ISO_DATE.test(v);
const record = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function parseEntryStats(v: unknown): EntryStats | null {
  const s = record(v);
  if (!s) return null;
  if (!isInt(s.box, 0, 5) || !isInt(s.seen, 0, 1e6) || !isInt(s.correct, 0, 1e6) || !isInt(s.wrong, 0, 1e6)) return null;
  if (!isDate(s.last) || !isDate(s.due)) return null;
  return { box: s.box, seen: s.seen, correct: s.correct, wrong: s.wrong, last: s.last, due: s.due };
}

function parseSetStats(v: unknown): SetStats | null {
  const s = record(v);
  if (!s || !isInt(s.rounds, 0, 1e6) || !isInt(s.bestStars, 0, 3) || !isDate(s.last)) return null;
  return { rounds: s.rounds, bestStars: s.bestStars, last: s.last };
}

function parseSkillStats(v: unknown): SkillStats | null {
  const s = record(v);
  if (!s || !isInt(s.seen, 0, 1e6) || !isInt(s.correct, 0, 1e6) || !isInt(s.streak, 0, 1e6) || !isDate(s.last) || s.correct > s.seen) return null;
  return { seen: s.seen, correct: s.correct, streak: s.streak, last: s.last };
}

function parseStoryStats(v: unknown): StoryStats | null {
  const s = record(v);
  if (!s) return null;
  const counts = ['plays', 'completed', 'correct', 'answered', 'supported', 'passes'] as const;
  if (!counts.every((k) => isInt(s[k], 0, 1e6)) || !isDate(s.last) || (s.correct as number) > (s.answered as number)) return null;
  return { plays: s.plays as number, completed: s.completed as number, correct: s.correct as number, answered: s.answered as number, supported: s.supported as number, passes: s.passes as number, last: s.last };
}

/**
 * Validates untrusted data (localStorage or an imported file) of version 1
 * or 2 and returns version 2. Invalid records are dropped individually
 * rather than discarding everything. Version 1's "pinned week" is dropped:
 * there is no current week any more.
 */
export function parseState(raw: unknown): LearnerState | null {
  const r = record(raw);
  if (!r || (r.version !== 1 && r.version !== 2)) return null;
  const state = emptyState();
  if (typeof r.displayName === 'string') state.displayName = r.displayName.slice(0, 40);
  if (r.lang === 'es' || r.lang === 'ru') state.lang = r.lang;
  if (typeof r.sound === 'boolean') state.sound = r.sound;
  for (const [key, value] of Object.entries(record(r.entries) ?? {})) {
    const stats = parseEntryStats(value);
    if (KEY.test(key) && stats) state.entries[key] = stats;
  }
  for (const [key, value] of Object.entries(record(r.sets) ?? {})) {
    const stats = parseSetStats(value);
    if (SET_ID.test(key) && stats) state.sets[key] = stats;
  }
  for (const [key, value] of Object.entries(record(r.skills) ?? {})) {
    const skills = record(value);
    if (!KEY.test(key) || !skills) continue;
    const parsed: Partial<Record<WordSkill, SkillStats>> = {};
    for (const skill of SKILLS) {
      const stats = parseSkillStats(skills[skill]);
      if (stats) parsed[skill] = stats;
    }
    if (Object.keys(parsed).length > 0) state.skills[key] = parsed;
  }
  for (const [key, value] of Object.entries(record(r.stories) ?? {})) {
    const stats = parseStoryStats(value);
    if (SET_ID.test(key) && stats) state.stories[key] = stats;
  }
  return state;
}

/** Adds one answer to a word skill. */
export function recordSkill(stats: SkillStats | undefined, correct: boolean, today: string): SkillStats {
  const previous = stats ?? { seen: 0, correct: 0, streak: 0, last: today };
  return { seen: previous.seen + 1, correct: previous.correct + (correct ? 1 : 0), streak: correct ? previous.streak + 1 : 0, last: today };
}

export function loadState(storage: Pick<Storage, 'getItem'> | null = safeStorage()): LearnerState {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return (text && parseState(JSON.parse(text))) || emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state: LearnerState, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return storage !== null;
  } catch {
    return false;
  }
}

export function clearState(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export interface ProgressExport {
  app: 'euskalduo';
  kind: 'learner-progress';
  exportedAt: string;
  state: LearnerState;
}

export function exportProgress(state: LearnerState, now = new Date()): string {
  const data: ProgressExport = { app: 'euskalduo', kind: 'learner-progress', exportedAt: now.toISOString(), state };
  return JSON.stringify(data, null, 2);
}

/** Reads export files of this and earlier versions. */
export function importProgress(text: string): LearnerState | null {
  try {
    const data = JSON.parse(text) as Partial<ProgressExport>;
    if (data.app !== 'euskalduo' || data.kind !== 'learner-progress') return null;
    return parseState(data.state);
  } catch {
    return null;
  }
}
