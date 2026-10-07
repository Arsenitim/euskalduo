import { expect, it } from 'vitest';
import { answerVoiceEntries, promptVoiceEntries } from './voicePolicy';
import type { Item, Question } from './questions';
const item: Item = { setId: 's', key: 's/e', entry: { id: 'e', basque: 'Kaixo', translations: { es: ['hola'] }, note: null, emoji: null, image: null, group: null } };
const base = { id: 'q', item, retry: false };
const questions: Question[] = [
  { ...base, kind: 'meaning-choice', options: [] },
  { ...base, kind: 'type-meaning' },
  { ...base, kind: 'basque-choice', options: [], pictureOnly: false },
  { ...base, kind: 'spell', tiles: [] },
  { ...base, kind: 'word-build', options: [] },
];
it('speaks only visible translation prompts before an answer and every correct target afterwards', () => {
  for (const question of questions) {
    expect(promptVoiceEntries(question)).toEqual(['meaning-choice', 'type-meaning'].includes(question.kind) ? [item.entry] : []);
    expect(answerVoiceEntries(question)).toEqual([item.entry]);
  }
});
it('uses the correct stored order after an order question', () => {
  const second = { ...item, key: 's/b', entry: { ...item.entry, id: 'b', basque: 'Agur' } };
  const question: Question = { kind: 'order', id: 'q', setId: 's', group: { key: 'g', title: 'g', ordered: true }, items: [item, second], shuffled: [second, item] };
  expect(promptVoiceEntries(question)).toEqual([]);
  expect(answerVoiceEntries(question)).toEqual([item.entry, second.entry]);
});
