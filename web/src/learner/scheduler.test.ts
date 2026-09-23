import { describe, expect, it } from 'vitest';
import { isDue, recordAnswer, selectionWeight } from './scheduler';

describe('scheduler', () => {
  it('moves words up one box on success and back to 0 on a mistake', () => {
    let s = recordAnswer(undefined, true, '2026-09-21');
    expect(s).toMatchObject({ box: 1, seen: 1, correct: 1, due: '2026-09-22' });
    s = recordAnswer(s, true, '2026-09-22');
    expect(s).toMatchObject({ box: 2, due: '2026-09-24' });
    s = recordAnswer(s, false, '2026-09-24');
    expect(s).toMatchObject({ box: 0, wrong: 1, due: '2026-09-24' });
  });

  it('does not punish breaks: a long pause leaves the box unchanged', () => {
    const s = recordAnswer(recordAnswer(undefined, true, '2026-01-01'), true, '2026-01-02');
    expect(isDue(s, '2026-12-01')).toBe(true);
    expect(s.box).toBe(2);
    expect(selectionWeight(s, '2026-12-01')).toBeGreaterThan(selectionWeight(s, '2026-01-02'));
  });

  it('ranks recently missed words above new words above due words above resting words', () => {
    const today = '2026-09-23';
    const missed = recordAnswer(undefined, false, today);
    const due = { ...recordAnswer(undefined, true, '2026-09-20') };
    const resting = recordAnswer(recordAnswer(recordAnswer(undefined, true, today), true, today), true, today);
    const weights = [selectionWeight(missed, today), selectionWeight(undefined, today), selectionWeight(due, today), selectionWeight(resting, today)];
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });
});
