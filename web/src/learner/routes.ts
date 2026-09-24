import type { HomeworkSet } from '../types';

/** Detail page of a set: weeks and categories live under different paths. */
export function setPath(set: HomeworkSet): string {
  return set.kind === 'topic' ? `/categoria/${set.id}` : `/semana/${set.id}`;
}

export function practicePath(set: HomeworkSet): string {
  return `/practicar?modo=${set.kind === 'topic' ? 'categoria' : 'semana'}&id=${set.id}`;
}
