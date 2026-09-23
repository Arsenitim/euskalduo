import { describe, expect, it } from 'vitest';
import { playCorrect, playRoundDone, playWrong } from './sounds';

describe('sounds', () => {
  it('are silent no-ops where Web Audio is unavailable', () => {
    expect(() => {
      playCorrect();
      playWrong();
      playRoundDone();
    }).not.toThrow();
  });
});
