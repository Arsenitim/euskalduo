import type { Group, SetKind } from '../types';

export interface Issue {
  path: string;
  entry: number | null;
  message: string;
}

export interface AdminEntry {
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
  weekStart: string | null;
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
}

export interface UsageReport {
  totals: UsageCounters;
  /** Last 30 days (UTC), newest first. */
  days: Array<UsageCounters & { day: string }>;
}

export interface ValidationResponse {
  valid: boolean;
  draft: Draft | null;
  errors: Issue[];
  warnings: Issue[];
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
};

/** Server issues attached to a failed save (422), if any. */
export function issuesOf(error: unknown): { errors: Issue[]; warnings: Issue[] } {
  if (error instanceof ApiError && Array.isArray(error.body.errors)) {
    return { errors: error.body.errors as Issue[], warnings: (error.body.warnings as Issue[]) ?? [] };
  }
  return { errors: [{ path: '', entry: null, message: error instanceof Error ? error.message : String(error) }], warnings: [] };
}
