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
});
