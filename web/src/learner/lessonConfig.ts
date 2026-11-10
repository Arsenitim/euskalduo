/**
 * The few numbers that shape a practice round, in one place. Selection
 * weights per item (mistakes, unseen, due, well known) live in scheduler.ts.
 */
export const LESSON = {
  /** Questions in a round (a story block counts as `listeningSlots`). */
  length: 10,
  minLength: 3,
  /** Word slots a short story replaces, so a lesson with listening is not longer. */
  listeningSlots: 3,
  /** How often a lesson includes a short story when a suitable one exists. */
  listeningChance: 0.6,
  /** A story heard this many days ago or less is not offered again in a lesson. */
  storyRestDays: 3,
  /** At most this many words from one sheet or topic in a lesson. */
  maxPerCollection: 4,
  /**
   * A collection's chance grows with the square root of its total item
   * weight, so a long sheet gets more turns than a short one, but cannot
   * take over every lesson.
   */
  collectionExponent: 0.5,
  /** At most this share of word slots goes to words never seen before. */
  maxNewShare: 0.4,
  /** Sentence-building and grammar questions per lesson (at most). */
  maxStructured: 2,
  /** Chances of the optional activities: they need not appear every time. */
  wordBuildChance: 0.5,
  orderChance: 0.5,
  /** In topic or exam practice: up to 2 due words from elsewhere (≤ 20 % of the round). */
  maxReviewInCollection: 2,
  /** Missed words come back this many questions later, at most this often. */
  retryGap: 3,
  maxRetries: 4,
  maxRetriesWithStory: 2,
} as const;
