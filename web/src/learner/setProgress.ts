import type { HomeworkSet } from '../types';
import { entryKey, type LearnerState } from './progress';
import { LEARNED_BOX } from './scheduler';

export function setProgress(set: HomeworkSet, state: LearnerState) {
  let learned = 0;
  let practiced = 0;
  for (const entry of set.entries) {
    const stats = state.entries[entryKey(set.id, entry.id)];
    if (!stats) continue;
    practiced++;
    if (stats.box >= LEARNED_BOX) learned++;
  }
  return { learned, practiced, total: set.entries.length, stars: state.sets[set.id]?.bestStars ?? 0, rounds: state.sets[set.id]?.rounds ?? 0 };
}
