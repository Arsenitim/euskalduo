import type { Content } from '../types';

/**
 * The only request the learner app makes while playing (feedback is sent
 * only from the feedback form, see feedback.ts). It carries no query
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
  return data;
}
