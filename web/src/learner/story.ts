import type { HomeworkSet, Story, StoryFormat } from '../types';
import { LESSON } from './lessonConfig';
import { answerKey } from './normalize';
import { addDays } from './scheduler';
import { entryKey, type LearnerState, type StoryStats } from './progress';
import { shuffle, type Rng } from './random';

/**
 * Listening comprehension. A story and its questions form one block:
 *
 * - The block scores like one question of the round: correct answers /
 *   questions, halved if the text was opened before answering
 *   ("supported"). A skipped block, or one whose audio could not be played,
 *   is not scored at all, so a technical problem is never a mistake.
 * - Results go to the story's own record (state.stories), never to word
 *   boxes: understanding a story does not prove every word in it, and a
 *   wrong answer does not reset them.
 * - "Understood" (a pass) = every question right for short stories, at
 *   least 75 % for extended ones, without opening the text.
 */
export type StoryStatus = 'done' | 'skipped' | 'unavailable';

export interface StoryResult {
  status: StoryStatus;
  /** One entry per question: right or wrong (null = not answered). */
  answers: (boolean | null)[];
  /** The text was opened before every question was answered. */
  supported: boolean;
}

/** Points for the round (0..1), or null when the block does not count. */
export function storyPoints(result: StoryResult): number | null {
  if (result.status !== 'done' || result.answers.length === 0) return null;
  const right = result.answers.filter((a) => a === true).length;
  return (right / result.answers.length) * (result.supported ? 0.5 : 1);
}

export function isPass(result: StoryResult): boolean {
  if (result.status !== 'done' || result.supported || result.answers.length === 0) return false;
  const ratio = result.answers.filter((a) => a === true).length / result.answers.length;
  return result.answers.length <= 2 ? ratio === 1 : ratio >= 0.75;
}

/** Updates the story's record. A block that could not be played changes nothing. */
export function recordStory(stats: StoryStats | undefined, result: StoryResult, today: string): StoryStats | undefined {
  if (result.status === 'unavailable') return stats;
  const previous = stats ?? { plays: 0, completed: 0, correct: 0, answered: 0, supported: 0, passes: 0, last: today };
  const next = { ...previous, plays: previous.plays + 1, last: today };
  if (result.status === 'done') {
    next.completed += 1;
    next.answered += result.answers.length;
    next.correct += result.answers.filter((a) => a === true).length;
    next.supported += result.supported ? 1 : 0;
    next.passes += isPass(result) ? 1 : 0;
  }
  return next;
}

export type StoryState = 'new' | 'heard' | 'supported' | 'understood';

export function storyState(stats: StoryStats | undefined): StoryState {
  if (!stats || stats.plays === 0) return 'new';
  if (stats.passes > 0) return 'understood';
  if (stats.supported > 0) return 'supported';
  return 'heard';
}

/**
 * The difficulty a learner is offered: 1 at first, 2 after understanding
 * two different stories without the text, 3 after four.
 */
export function listeningLevel(state: LearnerState): number {
  const understood = Object.values(state.stories).filter((s) => s.passes > 0).length;
  return Math.min(3, 1 + Math.floor(understood / 2));
}

/**
 * Share of the story's linked words the learner has practised. Linked words
 * are explicit entries plus catalogue words with exactly the listed
 * spelling. Spelling scores are not used: having seen a word is enough to
 * recognise it when listening.
 */
export function familiarity(story: Story, state: LearnerState, sets: HomeworkSet[]): number | null {
  const words = new Set(story.links.words.map(answerKey));
  const keys = new Set(story.links.entries);
  for (const set of sets) {
    for (const entry of set.entries) {
      if (words.has(answerKey(entry.basque))) keys.add(entryKey(set.id, entry.id));
    }
  }
  if (keys.size === 0) return null;
  let seen = 0;
  for (const key of keys) if ((state.entries[key]?.seen ?? 0) > 0) seen++;
  return seen / keys.size;
}

/** Whether a story suits this learner now (difficulty, known words, not just heard). */
export function isSuitable(story: Story, state: LearnerState, sets: HomeworkSet[], today: string): boolean {
  if (story.difficulty > listeningLevel(state)) return false;
  const last = state.stories[story.id]?.last;
  if (last && addDays(last, LESSON.storyRestDays) > today) return false;
  // Beginner fallback: easy stories are always fine; others need half the words known.
  if (story.difficulty === 1) return true;
  return (familiarity(story, state, sets) ?? 0) >= 0.5;
}

/** Never heard first, then the one heard longest ago; easier first on ties. */
function byFreshness(state: LearnerState) {
  return (a: Story, b: Story) => {
    const la = state.stories[a.id]?.last ?? '';
    const lb = state.stories[b.id]?.last ?? '';
    return la.localeCompare(lb) || a.difficulty - b.difficulty;
  };
}

/** The short story for a lesson, or null (none suitable, or not this time). */
export function pickLessonStory(stories: Story[], state: LearnerState, sets: HomeworkSet[], today: string, rng: Rng): Story | null {
  if (rng() >= LESSON.listeningChance) return null;
  const candidates = stories.filter((s) => s.format === 'short' && s.audio && isSuitable(s, state, sets, today));
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(byFreshness(state));
  // Among the freshest few, pick at random so lessons do not repeat a fixed order.
  return shuffle(sorted.slice(0, 3), rng)[0] ?? null;
}

/** A suggestion for the listening section: suitable and fresh, else the easiest fresh one. */
export function recommendStory(stories: Story[], state: LearnerState, sets: HomeworkSet[], today: string, format?: StoryFormat): Story | null {
  const pool = stories.filter((s) => !format || s.format === format);
  const suitable = pool.filter((s) => isSuitable(s, state, sets, today)).sort(byFreshness(state));
  if (suitable[0]) return suitable[0];
  return [...pool].sort((a, b) => a.difficulty - b.difficulty || byFreshness(state)(a, b))[0] ?? null;
}

/** Option order for each question, shuffled every time the story is served. */
export function shuffledOptions(story: Story, rng: Rng): number[][] {
  return story.questions.map((q) => shuffle(q.options.map((_, i) => i), rng));
}
