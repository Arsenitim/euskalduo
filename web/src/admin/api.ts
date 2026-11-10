import type { EntryType, Formation, GrammarExercise, Group, Localized, SentenceExercise, SetKind, StoryFormat, StoryQuestion } from '../types';

export interface Issue {
  path: string;
  entry: number | null;
  message: string;
}

export interface AdminEntry {
  type?: EntryType;
  sentence?: SentenceExercise | null;
  grammar?: GrammarExercise | null;
  formation?: Formation | null;
  id: string | null;
  basque: string;
  translations: { es: string[]; ru?: string[] };
  note: string | null;
  group: string | null;
  emoji: string | null;
  imageHint: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  image?: string | null;
}

export interface Draft {
  kind: SetKind;
  title: string;
  /** When the sheet arrived: information only. */
  receivedOn: string | null;
  description: string | null;
  groups: Group[];
  entries: AdminEntry[];
}

export interface AdminSet extends Draft {
  id: string;
  status: 'draft' | 'published';
  sample: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface SetSummary extends Omit<AdminSet, 'entries'> {
  entryCount: number;
  imageCount: number;
  reviewCount: number;
}

export interface UsageCounters {
  new_devices: number;
  active_devices: number;
  answers: number;
  correct: number;
  hinted: number;
  wrong: number;
  skipped: number;
  rounds: number;
  /** Devices practising for the first time that week (Monday–Sunday). */
  weekly_devices: number;
}

export interface UsageWeek {
  /** Monday (UTC). */
  week: string;
  weekly_devices: number;
  new_devices: number;
  answers: number;
  rounds: number;
}

export interface UsageBreakdownRow {
  key: string;
  /** Set title, for the 'set' dimension (null if the set was deleted). */
  title?: string | null;
  answers: number;
  correct: number;
  hinted: number;
  wrong: number;
  skipped: number;
  rounds: number;
}

export type UsageDimension = 'set' | 'story' | 'exercise' | 'mode' | 'connection' | 'display';

export interface UsageReport {
  totals: UsageCounters;
  /** Last 30 days (UTC), newest first. */
  days: Array<UsageCounters & { day: string }>;
  /** Last 8 weeks, newest first. */
  weeks: UsageWeek[];
  /** Each dimension's totals over the last 30 days, busiest first. */
  breakdown: Record<UsageDimension, UsageBreakdownRow[]>;
}

export interface ValidationResponse {
  valid: boolean;
  draft: Draft | null;
  errors: Issue[];
  warnings: Issue[];
}

export interface StoryDraft {
  id: string | null;
  title: string;
  format: StoryFormat;
  difficulty: number;
  transcript: string;
  translations: Localized;
  questions: StoryQuestion[];
  links: { sets: string[]; entries: string[]; words: string[]; topics: string[] };
  needsReview: boolean;
  reviewNote: string | null;
}

export interface AdminStory extends StoryDraft {
  id: string;
  status: 'draft' | 'published';
  sample: boolean;
  updatedAt: string;
  audio: { state: 'ready' | 'pending' | 'failed'; url: string | null; durationMs: number | null; failure: string | null };
  publishBlockers: string[];
  publishWarnings: string[];
}

export interface StoryValidation {
  valid: boolean;
  draft: StoryDraft | null;
  errors: Issue[];
  warnings: Issue[];
}

export interface AdminExam {
  id: string;
  title: string;
  examDate: string | null;
  setIds: string[];
  status: 'draft' | 'published';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(path, { method, headers, body: payload, credentials: 'same-origin' });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(typeof data.error === 'string' ? data.error : `Request failed (${response.status})`, response.status, data);
  }
  return data as T;
}

interface SessionState {
  authenticated: boolean;
  username?: string;
  csrfToken?: string;
}

function remember(state: SessionState): SessionState {
  csrfToken = state.csrfToken ?? null;
  return state;
}

export const adminApi = {
  session: async () => remember(await request<SessionState>('GET', '/api/admin/session')),
  login: async (username: string, password: string) => remember(await request<SessionState>('POST', '/api/admin/login', { username, password })),
  logout: async () => remember(await request<SessionState>('POST', '/api/admin/logout', {})),
  listSets: () => request<{ sets: SetSummary[] }>('GET', '/api/admin/sets'),
  getSet: (id: string) => request<{ set: AdminSet; publishBlockers: string[] }>('GET', `/api/admin/sets/${id}`),
  validate: (format: 'json' | 'lines', text: string) => request<ValidationResponse>('POST', '/api/admin/import/validate', { format, text }),
  createSet: (draft: Draft) => request<{ set: AdminSet; warnings: Issue[] }>('POST', '/api/admin/sets', draft),
  updateSet: (id: string, draft: Draft) => request<{ set: AdminSet; warnings: Issue[] }>('PUT', `/api/admin/sets/${id}`, draft),
  deleteSet: (id: string) => request<unknown>('DELETE', `/api/admin/sets/${id}`),
  publish: (id: string) => request<{ set: AdminSet }>('POST', `/api/admin/sets/${id}/publish`, {}),
  unpublish: (id: string) => request<{ set: AdminSet }>('POST', `/api/admin/sets/${id}/unpublish`, {}),
  uploadImage: (setId: string, entryId: string, file: File) => {
    const form = new FormData();
    form.append('image', file);
    return request<{ image: string }>('POST', `/api/admin/sets/${setId}/entries/${entryId}/image`, form);
  },
  stats: () => request<UsageReport>('GET', '/api/admin/stats'),
  deleteImage: (setId: string, entryId: string) => request<unknown>('DELETE', `/api/admin/sets/${setId}/entries/${entryId}/image`),
  listStories: () => request<{ stories: AdminStory[] }>('GET', '/api/admin/stories'),
  getStory: (id: string) => request<{ story: AdminStory }>('GET', `/api/admin/stories/${id}`),
  validateStory: (text: string) => request<StoryValidation>('POST', '/api/admin/stories/validate', { text }),
  createStory: (draft: StoryDraft) => request<{ story: AdminStory; warnings: Issue[] }>('POST', '/api/admin/stories', draft),
  updateStory: (id: string, draft: StoryDraft) => request<{ story: AdminStory; warnings: Issue[] }>('PUT', `/api/admin/stories/${id}`, draft),
  deleteStory: (id: string) => request<unknown>('DELETE', `/api/admin/stories/${id}`),
  publishStory: (id: string) => request<{ story: AdminStory }>('POST', `/api/admin/stories/${id}/publish`, {}),
  unpublishStory: (id: string) => request<{ story: AdminStory }>('POST', `/api/admin/stories/${id}/unpublish`, {}),
  listExams: () => request<{ exams: AdminExam[] }>('GET', '/api/admin/exams'),
  createExam: (exam: Omit<AdminExam, 'id' | 'status'>) => request<{ exam: AdminExam }>('POST', '/api/admin/exams', exam),
  updateExam: (id: string, exam: Omit<AdminExam, 'id' | 'status'>) => request<{ exam: AdminExam }>('PUT', `/api/admin/exams/${id}`, exam),
  publishExam: (id: string) => request<{ exam: AdminExam }>('POST', `/api/admin/exams/${id}/publish`, {}),
  unpublishExam: (id: string) => request<{ exam: AdminExam }>('POST', `/api/admin/exams/${id}/unpublish`, {}),
  deleteExam: (id: string) => request<unknown>('DELETE', `/api/admin/exams/${id}`),
};

/** Server issues attached to a failed save (422), if any. */
export function issuesOf(error: unknown): { errors: Issue[]; warnings: Issue[] } {
  if (error instanceof ApiError && Array.isArray(error.body.errors)) {
    return { errors: error.body.errors as Issue[], warnings: (error.body.warnings as Issue[]) ?? [] };
  }
  return { errors: [{ path: '', entry: null, message: error instanceof Error ? error.message : String(error) }], warnings: [] };
}
