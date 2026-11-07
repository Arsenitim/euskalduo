import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushStats, reportAnswer, reportRound } from './stats';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

describe('usage stats', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', memoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('flags a new device once and an active day once per day, with no identifier', async () => {
    reportAnswer('correct', '2026-09-24');
    await flushStats();
    reportAnswer('hinted', '2026-09-24');
    await flushStats();
    reportRound('2026-09-24');
    await flushStats();
    reportAnswer('skipped', '2026-09-25');
    await flushStats();

    expect(bodies()).toEqual([
      { day: '2026-09-24', newDevice: true, activeToday: true, answers: { correct: 1 } },
      { day: '2026-09-24', answers: { hinted: 1 } },
      { day: '2026-09-24', rounds: 1 },
      { day: '2026-09-25', activeToday: true, answers: { skipped: 1 } },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/public/stats');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true });
    expect(localStorage.getItem('euskalduo.stats.pending.v1')).toBeNull();
  });

  it('keeps counters while offline and sends them per day once back online', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    reportAnswer('correct', '2026-09-24');
    await flushStats();
    reportAnswer('wrong', '2026-09-24');
    reportRound('2026-09-24');
    await flushStats();
    reportAnswer('correct', '2026-09-25');
    await flushStats();
    const tries = fetchMock.mock.calls.length;

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await flushStats();

    expect(bodies().slice(tries)).toEqual([
      { day: '2026-09-24', newDevice: true, activeToday: true, answers: { correct: 1, wrong: 1 }, rounds: 1 },
      { day: '2026-09-25', activeToday: true, answers: { correct: 1 } },
    ]);
    expect(localStorage.getItem('euskalduo.stats.pending.v1')).toBeNull();
  });

  it('splits a long offline session into requests the server accepts, and keeps answers given meanwhile', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    for (let i = 0; i < 1203; i++) reportAnswer('correct', '2026-09-24');
    await flushStats();
    const tries = fetchMock.mock.calls.length;

    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = () => resolve(new Response(null, { status: 204 })))));
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const done = flushStats();
    reportAnswer('wrong', '2026-09-24'); // while the first chunk is on its way
    await vi.waitFor(() => expect(release).toBeDefined());
    release();
    await done;
    await flushStats();

    const sent = bodies().slice(tries);
    expect(sent.map((b) => b.answers)).toEqual([{ correct: 500 }, { correct: 500, wrong: 1 }, { correct: 203 }]);
    expect(sent.filter((b) => b.newDevice)).toHaveLength(1);
  });

  it('drops a batch the server rejects instead of retrying it forever', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    reportAnswer('correct', '2026-09-24');
    await flushStats();
    expect(localStorage.getItem('euskalduo.stats.pending.v1')).toBeNull();
  });

  it('sends right away without device flags when the browser cannot store anything', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    reportAnswer('wrong', '2026-09-24');
    reportAnswer('wrong', '2026-09-24');

    expect(bodies()).toEqual([
      { day: '2026-09-24', answers: { wrong: 1 } },
      { day: '2026-09-24', answers: { wrong: 1 } },
    ]);
  });
});
