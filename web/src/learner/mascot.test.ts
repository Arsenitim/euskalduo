import { describe, expect, it } from 'vitest';
import { isStreakMilestone, mascotStateFor, newMascotTracker, nextMascot, type MascotAnswer, type MascotShow, type MascotTracker } from './mascot';
import { seeded } from './random';

const never = () => 0.99;
const always = () => 0;
const right: MascotAnswer = { correct: true };
const wrong: MascotAnswer = { correct: false };

function run(answers: MascotAnswer[], rng = never, tracker: MascotTracker = { streak: 0, misses: 0, since: 3, next: 'hedgehog' }) {
  const shows: (MascotShow | null)[] = [];
  for (const answer of answers) {
    const result = nextMascot(tracker, answer, rng);
    tracker = result.tracker;
    shows.push(result.show);
  }
  return shows;
}

describe('mascot', () => {
  it('cheers on streak milestones only', () => {
    const shows = run(Array<MascotAnswer>(17).fill(right));
    expect(shows.map((s, i) => (s ? i + 1 : 0)).filter(Boolean)).toEqual([3, 7, 12, 17]);
    expect(shows[2]).toEqual({ kind: 'hedgehog', state: 'cheer' });
    expect(shows[6]?.kind).toBe('sheep');
    expect([1, 2, 4, 5, 6, 8, 13].some(isStreakMilestone)).toBe(false);
  });

  it('is sad on the second miss in a row, not the first', () => {
    const shows = run([wrong, wrong, wrong]);
    expect(shows).toEqual([null, { kind: 'hedgehog', state: 'wrong' }, null]);
  });

  it('cheers a comeback on a retried word', () => {
    expect(run([{ correct: true, retry: true }])[0]).toEqual({ kind: 'hedgehog', state: 'cheer' });
  });

  it('respects the cooldown, even for surprises', () => {
    const shows = run(Array<MascotAnswer>(9).fill(right), always);
    expect(shows.map((s) => (s ? 1 : 0))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('picks the animation from the answer', () => {
    expect(mascotStateFor({ correct: true, hinted: true })).toBe('hint');
    expect(mascotStateFor({ correct: true, almost: true })).toBe('almost');
    expect(mascotStateFor({ correct: false, skipped: true })).toBe('skip');
  });

  it('shows up on a minority of answers in a typical round', () => {
    const rng = seeded(7);
    let total = 0;
    for (let round = 0; round < 200; round++) {
      const answers = Array.from({ length: 20 }, () => ({ correct: rng() < 0.75 }));
      total += run(answers, rng, newMascotTracker(rng)).filter(Boolean).length;
    }
    const perRound = total / 200;
    expect(perRound).toBeGreaterThan(2);
    expect(perRound).toBeLessThan(6);
  });
});
