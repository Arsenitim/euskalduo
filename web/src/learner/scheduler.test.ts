import { describe, expect, it } from 'vitest';
import { isDue, recordAnswer, selectionWeight } from './scheduler';

describe('scheduler', () => {
  it('moves words up one box on success and back to 0 on a mistake', () => {
    let s = recordAnswer(undefined, 'correct', '2026-09-21');
    expect(s).toMatchObject({ box: 1, seen: 1, correct: 1, due: '2026-09-22' });
    s = recordAnswer(s, 'correct', '2026-09-22');
    expect(s).toMatchObject({ box: 2, due: '2026-09-24' });
    s = recordAnswer(s, 'wrong', '2026-09-24');
    expect(s).toMatchObject({ box: 0, wrong: 1, due: '2026-09-24' });
  });

  it('does not punish breaks: a long pause leaves the box unchanged', () => {
    const s = recordAnswer(recordAnswer(undefined, 'correct', '2026-01-01'), 'correct', '2026-01-02');
    expect(isDue(s, '2026-12-01')).toBe(true);
    expect(s.box).toBe(2);
    expect(selectionWeight(s, '2026-12-01')).toBeGreaterThan(selectionWeight(s, '2026-01-02'));
  });

  it('ranks recently missed words above new words above due words above resting words', () => {
    const today = '2026-09-23';
    const missed = recordAnswer(undefined, 'wrong', today);
    const due = { ...recordAnswer(undefined, 'correct', '2026-09-20') };
    const resting = recordAnswer(recordAnswer(recordAnswer(undefined, 'correct', today), 'correct', today), 'correct', today);
    const weights = [selectionWeight(missed, today), selectionWeight(undefined, today), selectionWeight(due, today), selectionWeight(resting, today)];
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('keeps a word in its box when it was answered with a hint', () => {
    const boxTwo = recordAnswer(recordAnswer(undefined, 'correct', '2026-09-21'), 'correct', '2026-09-22');
    const hinted = recordAnswer(boxTwo, 'hinted', '2026-09-24');
    expect(hinted.box).toBe(2);
    expect(hinted.due).toBe('2026-09-26');
    expect([hinted.seen, hinted.correct, hinted.wrong]).toEqual([3, 2, 0]);
    expect(recordAnswer(undefined, 'hinted', '2026-09-24').box).toBe(0);
  });
});
