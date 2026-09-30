import type { Rng } from './random';

export type MascotKind = 'hedgehog' | 'sheep';
export type MascotState = 'cheer' | 'hint' | 'almost' | 'wrong' | 'skip';

export interface MascotShow {
  kind: MascotKind;
  state: MascotState;
}

/**
 * Per-round memory for deciding when a mascot appears. They show up only
 * occasionally, so they stay fun instead of becoming noise.
 */
export interface MascotTracker {
  streak: number;
  misses: number;
  /** Answers since the last appearance. */
  since: number;
  /** Which mascot is next: they take turns. */
  next: MascotKind;
}

export interface MascotAnswer {
  correct: boolean;
  hinted?: boolean;
  almost?: boolean;
  skipped?: boolean;
  /** The retry of a word missed earlier in the round. */
  retry?: boolean;
}

/** At least this many answers without a mascot between two appearances. */
export const MASCOT_COOLDOWN = 3;
export const MASCOT_SURPRISE = 0.1;

export function newMascotTracker(rng: Rng): MascotTracker {
  return { streak: 0, misses: 0, since: MASCOT_COOLDOWN, next: rng() < 0.5 ? 'hedgehog' : 'sheep' };
}

/** 3rd, 7th and 12th right answer in a row, then every 5th. */
export function isStreakMilestone(streak: number): boolean {
  return streak === 3 || streak === 7 || streak === 12 || (streak > 12 && (streak - 12) % 5 === 0);
}

export function mascotStateFor(answer: MascotAnswer): MascotState {
  if (!answer.correct) return answer.skipped ? 'skip' : 'wrong';
  if (answer.hinted) return 'hint';
  return answer.almost ? 'almost' : 'cheer';
}

export function nextMascot(tracker: MascotTracker, answer: MascotAnswer, rng: Rng): { tracker: MascotTracker; show: MascotShow | null } {
  const streak = answer.correct ? tracker.streak + 1 : 0;
  const misses = answer.correct ? 0 : tracker.misses + 1;
  const reason =
    (answer.correct && isStreakMilestone(streak)) ||
    (answer.correct && answer.retry === true) ||
    (!answer.correct && misses === 2) ||
    rng() < MASCOT_SURPRISE;

  if (!reason || tracker.since < MASCOT_COOLDOWN) {
    return { tracker: { ...tracker, streak, misses, since: tracker.since + 1 }, show: null };
  }
  const show = { kind: tracker.next, state: mascotStateFor(answer) };
  return { tracker: { streak, misses, since: 0, next: tracker.next === 'hedgehog' ? 'sheep' : 'hedgehog' }, show };
}
