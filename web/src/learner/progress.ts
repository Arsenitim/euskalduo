import type { Lang } from '../types';
import type { EntryStats } from './scheduler';

/**
 * Everything about the learner lives here, in this browser's localStorage,
 * and is never sent to the server. Keys are "<setId>/<entryId>" so edits to
 * homework content keep progress for unchanged entries.
 */
export const STORAGE_KEY = 'euskalduo.learner.v1';

export interface SetStats {
  rounds: number;
  bestStars: number;
  last: string;
}

export interface LearnerState {
  version: 1;
  displayName: string;
  lang: Lang;
  /** Sound effects for answers (on by default). */
  sound: boolean;
  /** Set id chosen manually as "this week", or null for the newest week. */
  pinnedWeek: string | null;
  entries: Record<string, EntryStats>;
  sets: Record<string, SetStats>;
}

export function emptyState(): LearnerState {
  return { version: 1, displayName: '', lang: 'es', sound: true, pinnedWeek: null, entries: {}, sets: {} };
}

export function entryKey(setId: string, entryId: string): string {
  return `${setId}/${entryId}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z0-9_-]{1,40}\/[a-z0-9_-]{1,40}$/;
const SET_ID = /^[a-z0-9_-]{1,40}$/;

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function parseEntryStats(v: unknown): EntryStats | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (!isInt(s.box, 0, 5) || !isInt(s.seen, 0, 1e6) || !isInt(s.correct, 0, 1e6) || !isInt(s.wrong, 0, 1e6)) return null;
  if (typeof s.last !== 'string' || !ISO_DATE.test(s.last) || typeof s.due !== 'string' || !ISO_DATE.test(s.due)) return null;
  return { box: s.box, seen: s.seen, correct: s.correct, wrong: s.wrong, last: s.last, due: s.due };
}

function parseSetStats(v: unknown): SetStats | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (!isInt(s.rounds, 0, 1e6) || !isInt(s.bestStars, 0, 3) || typeof s.last !== 'string' || !ISO_DATE.test(s.last)) return null;
  return { rounds: s.rounds, bestStars: s.bestStars, last: s.last };
}

/**
 * Validates untrusted data (localStorage or an imported file). Invalid
 * records are dropped individually rather than discarding everything.
 */
export function parseState(raw: unknown): LearnerState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const state = emptyState();
  if (typeof r.displayName === 'string') state.displayName = r.displayName.slice(0, 40);
  if (r.lang === 'es' || r.lang === 'ru') state.lang = r.lang;
  if (typeof r.sound === 'boolean') state.sound = r.sound;
  if (typeof r.pinnedWeek === 'string' && SET_ID.test(r.pinnedWeek)) state.pinnedWeek = r.pinnedWeek;
  if (typeof r.entries === 'object' && r.entries !== null) {
    for (const [key, value] of Object.entries(r.entries)) {
      const stats = parseEntryStats(value);
      if (KEY.test(key) && stats) state.entries[key] = stats;
    }
  }
  if (typeof r.sets === 'object' && r.sets !== null) {
    for (const [key, value] of Object.entries(r.sets)) {
      const stats = parseSetStats(value);
      if (SET_ID.test(key) && stats) state.sets[key] = stats;
    }
  }
  return state;
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

export function importProgress(text: string): LearnerState | null {
  try {
    const data = JSON.parse(text) as Partial<ProgressExport>;
    if (data.app !== 'euskalduo' || data.kind !== 'learner-progress') return null;
    return parseState(data.state);
  } catch {
    return null;
  }
}
