import type { Entry } from '../types';
import type { Question } from './questions';

/**
 * Word voice only. Prompts are spoken when they show Basque the learner is
 * not asked to produce. A story block never uses this voice: its recording
 * has its own player, and its text is never read out by word audio.
 */
export function promptVoiceEntries(question: Question): Entry[] {
  return question.kind === 'meaning-choice' || question.kind === 'type-meaning' ? [question.item.entry] : [];
}
export function answerVoiceEntries(question: Question): Entry[] {
  if (question.kind === 'story') return [];
  return (question.kind === 'order' ? question.items : [question.item]).map((item) => item.entry);
}
