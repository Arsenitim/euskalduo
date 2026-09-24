import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendFeedback } from './feedback';

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { hash: '#/practicar' }, innerWidth: 820, innerHeight: 1180 });
  return fetchMock;
}

const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });

describe('sendFeedback', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the typed text, current screen and window size without cookies or referrer', async () => {
    const fetchMock = stubFetch(json(201, { id: 'x' }));

    expect(await sendFeedback({ name: '  ', message: 'Hola', screenshot: null })).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/public/feedback');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer' });
    const body = init.body as FormData;
    expect([...body.keys()].sort()).toEqual(['message', 'page', 'viewport']);
    expect(body.get('page')).toBe('#/practicar');
    expect(body.get('viewport')).toBe('820x1180');
  });

  it.each([
    [json(429, { code: 'rate_limited' }), { ok: false, reason: 'rate_limited' }],
    [json(400, { code: 'bad_image' }), { ok: false, reason: 'bad_image' }],
    [json(507, { code: 'full', contact: 'Arsenii' }), { ok: false, reason: 'full', contact: 'Arsenii' }],
    [new Response('<html>', { status: 413 }), { ok: false, reason: 'too_big' }],
    [new Response('<html>', { status: 502 }), { ok: false, reason: 'network' }],
    [new TypeError('offline'), { ok: false, reason: 'network' }],
  ])('maps failures to a reason (%#)', async (response, expected) => {
    stubFetch(response);
    expect(await sendFeedback({ name: 'Ane', message: 'Hola', screenshot: null })).toEqual(expected);
  });
});
