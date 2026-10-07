import type { Entry } from '../types';
import type { Question } from './questions';

export function promptVoiceEntries(question: Question): Entry[] {
  return question.kind === 'meaning-choice' || question.kind === 'type-meaning' ? [question.item.entry] : [];
}
export function answerVoiceEntries(question: Question): Entry[] {
  return (question.kind === 'order' ? question.items : [question.item]).map((item) => item.entry);
}
