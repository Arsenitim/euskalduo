import type { Content } from '../types';

/**
 * The only content request of the learner app. Besides it, the app sends
 * only anonymous counters while practising (stats.ts) and feedback from the
 * feedback form (feedback.ts). It carries no query
 * parameters, no body and no cookies: the whole published catalogue is
 * downloaded and every choice (week, answers, name) stays in the browser.
 */
export async function fetchContent(): Promise<Content> {
  const response = await fetch('/api/public/content', {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-cache',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as Content;
  if (!data || !Array.isArray(data.sets)) {
    throw new Error('Unexpected content format');
  }
  // Responses from before categories existed have no kind: they are all weeks.
  return { ...data, sets: data.sets.map((set) => ({ ...set, kind: set.kind === 'topic' ? 'topic' : 'week' })) };
}
