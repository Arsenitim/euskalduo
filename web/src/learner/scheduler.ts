/**
 * Simple, documented "boxes" scheduler (a Leitner system):
 *
 * - Every word has a box from 0 to 5. New words start unseen.
 * - First answer of a word in a round: correct → one box up; wrong (or
 *   "No lo sé") → box 0; correct with a hint → stays in its box.
 * - A word in box b is "due" again INTERVAL_DAYS[b] days after it was last
 *   answered. Missing days never moves a word down — breaks are not punished.
 * - Selection weight: words just answered wrong come first, then new words,
 *   then due words (lower boxes before higher), and not-yet-due words only
 *   rarely. A word in box ≥ 3 counts as "learned" in the progress view.
 */
export const MAX_BOX = 5;
export const LEARNED_BOX = 3;
export const INTERVAL_DAYS = [0, 1, 2, 4, 7, 14] as const;

export interface EntryStats {
  box: number;
  seen: number;
  correct: number;
  wrong: number;
  /** ISO date (YYYY-MM-DD) of the last answer. */
  last: string;
  /** ISO date from which the word is due for review again. */
  due: string;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** How a word was answered: on its own, with a hint (half credit), or not at all. */
export type AnswerResult = 'correct' | 'hinted' | 'wrong';

export function recordAnswer(stats: EntryStats | undefined, result: AnswerResult, today: string): EntryStats {
  const previous = stats ?? { box: 0, seen: 0, correct: 0, wrong: 0, last: today, due: today };
  const correct = result === 'correct';
  const box = correct ? Math.min(MAX_BOX, previous.box + 1) : result === 'hinted' ? previous.box : 0;
  return {
    box,
    seen: previous.seen + 1,
    correct: previous.correct + (correct ? 1 : 0),
    wrong: previous.wrong + (result === 'wrong' ? 1 : 0),
    last: today,
    due: addDays(today, INTERVAL_DAYS[box] ?? 14),
  };
}

export function isDue(stats: EntryStats | undefined, today: string): boolean {
  return stats !== undefined && stats.due <= today;
}

export function selectionWeight(stats: EntryStats | undefined, today: string): number {
  if (!stats || stats.seen === 0) return 3;
  if (stats.box === 0) return 4;
  if (isDue(stats, today)) return 2 + (MAX_BOX - stats.box) * 0.2;
  return 0.4;
}
