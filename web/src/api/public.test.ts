import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchContent } from './public';

describe('fetchContent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a bare GET without cookies, body, query or referrer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, sets: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchContent();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/public/content');
    expect(init).toEqual({ method: 'GET', credentials: 'omit', cache: 'no-cache', referrerPolicy: 'no-referrer' });
  });

  it('treats sets without a kind (older servers) as homework weeks', async () => {
    const sets = [{ id: 'a', weekStart: '2026-09-21' }, { id: 'b', kind: 'topic', weekStart: null }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, sets }), { status: 200 })));

    const content = await fetchContent();

    expect(content.sets.map((s) => s.kind)).toEqual(['week', 'topic']);
  });
});
