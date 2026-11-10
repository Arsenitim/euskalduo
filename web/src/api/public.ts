import type { Content, Exam, HomeworkSet, Story } from '../types';

/**
 * The only content request of the learner app. Besides it, the app sends
 * only anonymous counters while practising (stats.ts) and feedback from the
 * feedback form (feedback.ts). It carries no query
 * parameters, no body and no cookies: the whole published catalogue is
 * downloaded and every choice (topic, story, answers, name) stays in the browser.
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
  const data = (await response.json()) as Partial<Content> & { sets?: unknown };
  if (!data || !Array.isArray(data.sets)) {
    throw new Error('Unexpected content format');
  }
  return normalizeContent(data);
}

type LegacySet = Partial<HomeworkSet> & { kind?: string; weekStart?: string | null; examDate?: string | null };

/**
 * Accepts catalogues from older servers too (for example one saved for
 * offline use before an update): "week" sets become sheets, a set's exam
 * date becomes an exam of that set, and missing lists are empty.
 */
export function normalizeContent(data: { schemaVersion?: number; sets?: unknown; stories?: unknown; exams?: unknown }): Content {
  const rawSets = (Array.isArray(data.sets) ? data.sets : []) as LegacySet[];
  const sets: HomeworkSet[] = rawSets.map((set) => ({
    id: String(set.id),
    kind: set.kind === 'topic' ? 'topic' : 'sheet',
    title: String(set.title ?? ''),
    receivedOn: set.receivedOn ?? set.weekStart ?? null,
    description: set.description ?? null,
    sample: set.sample === true,
    groups: set.groups ?? [],
    entries: (set.entries ?? []).map((entry) => ({ ...entry, type: entry.type ?? 'word' })),
  }));
  const exams: Exam[] = Array.isArray(data.exams)
    ? (data.exams as Exam[])
    : rawSets.filter((s) => typeof s.examDate === 'string').map((s) => ({ id: String(s.id), title: String(s.title), examDate: s.examDate!, setIds: [String(s.id)] }));
  const stories = (Array.isArray(data.stories) ? data.stories : []) as Story[];
  return { schemaVersion: data.schemaVersion ?? 1, sets, stories, exams };
}
