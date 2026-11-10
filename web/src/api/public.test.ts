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

  it('reads catalogues from older servers: weeks become sheets, set exam dates become exams', async () => {
    const sets = [{ id: 'a', kind: 'week', title: 'A', weekStart: '2026-09-21', examDate: '2026-12-01', entries: [{ id: 'e', basque: 'x', translations: { es: ['y'] } }] }, { id: 'b', kind: 'topic', weekStart: null }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, sets }), { status: 200 })));

    const content = await fetchContent();

    expect(content.sets.map((s) => s.kind)).toEqual(['sheet', 'topic']);
    expect(content.sets[0]!.receivedOn).toBe('2026-09-21');
    expect(content.sets[0]!.entries[0]!.type).toBe('word');
    expect(content.exams).toEqual([{ id: 'a', title: 'A', examDate: '2026-12-01', setIds: ['a'] }]);
    expect(content.stories).toEqual([]);
  });

  it('keeps stories and exams from the current server', async () => {
    const body = { schemaVersion: 2, sets: [], stories: [{ id: 's', audio: '/audio/x.mp3' }], exams: [{ id: 'x', title: 'X', examDate: null, setIds: [] }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const content = await fetchContent();
    expect(content.stories.map((s) => s.id)).toEqual(['s']);
    expect(content.exams.map((e) => e.id)).toEqual(['x']);
  });
});
