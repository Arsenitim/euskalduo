import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushStats, reportAnswer, reportRound, setStatsExcluded, statsExcluded, weekOf } from './stats';

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
      { day: '2026-09-24', newDevice: true, activeToday: true, activeWeek: true, answers: { correct: 1 } },
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
      { day: '2026-09-24', newDevice: true, activeToday: true, activeWeek: true, answers: { correct: 1, wrong: 1 }, rounds: 1 },
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

  it('flags a device once per week (weeks start on Monday)', async () => {
    expect(weekOf('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(weekOf('2026-09-28')).toBe('2026-09-28'); // Monday
    for (const day of ['2026-09-24', '2026-09-27', '2026-09-28', '2026-09-29']) {
      reportAnswer('correct', day);
      await flushStats();
    }
    expect(bodies().map((b) => [b.day, b.activeWeek ?? false])).toEqual([
      ['2026-09-24', true],
      ['2026-09-27', false],
      ['2026-09-28', true],
      ['2026-09-29', false],
    ]);
  });

  it('breaks answers and rounds down by set, exercise, mode, connection and app/browser', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    reportAnswer('correct', '2026-09-24', { set: 'week-1', exercise: 'spell', mode: 'topic' });
    reportAnswer('wrong', '2026-09-24', { set: 'week-1', exercise: 'order', mode: 'topic' });
    reportRound('2026-09-24', { sets: ['week-1'], mode: 'topic' });
    reportRound('2026-09-24', { sets: [], mode: 'lesson' });
    await flushStats();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await flushStats();

    const body = bodies().at(-1);
    expect(body).toMatchObject({ day: '2026-09-24', answers: { correct: 1, wrong: 1 }, rounds: 2 });
    const parts = Object.fromEntries(body.breakdown.map((p: { dimension: string; key: string }) => [`${p.dimension}:${p.key}`, p]));
    expect(parts['set:week-1']).toEqual({ dimension: 'set', key: 'week-1', answers: { correct: 1, wrong: 1 }, rounds: 1 });
    expect(parts['exercise:spell']).toEqual({ dimension: 'exercise', key: 'spell', answers: { correct: 1 } });
    expect(parts['exercise:order']).toEqual({ dimension: 'exercise', key: 'order', answers: { wrong: 1 } });
    expect(parts['mode:topic']).toMatchObject({ answers: { correct: 1, wrong: 1 }, rounds: 1 });
    expect(parts['mode:lesson']).toEqual({ dimension: 'mode', key: 'lesson', rounds: 1 });
    expect(parts['connection:online']).toMatchObject({ rounds: 2 });
    expect(parts['display:browser']).toMatchObject({ rounds: 2 });
    expect(Object.keys(parts)).toHaveLength(7);
    expect(localStorage.getItem('euskalduo.stats.pending.v1')).toBeNull();
  });

  it('labels listening answers by story and never by set', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    reportAnswer('correct', '2026-09-24', { story: 'triku-1', exercise: 'listening', mode: 'listening' });
    reportRound('2026-09-24', { sets: [], stories: ['triku-1'], mode: 'listening' });
    await flushStats();
    const keys = bodies().flatMap((b) => b.breakdown.map((p: { dimension: string; key: string }) => `${p.dimension}:${p.key}`));
    expect(new Set(keys)).toEqual(new Set(['story:triku-1', 'exercise:listening', 'mode:listening', 'connection:online', 'display:browser']));
  });

  it('still sends counters queued offline by the previous version', async () => {
    const old = { '2026-09-20': { answers: { correct: 2, hinted: 0, wrong: 0, skipped: 0 }, rounds: 1, parts: { '["mode","week"]': { answers: { correct: 2, hinted: 0, wrong: 0, skipped: 0 }, rounds: 1 } } } };
    localStorage.setItem('euskalduo.stats.pending.v1', JSON.stringify(old));
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await flushStats();
    expect(bodies()[0]).toMatchObject({ day: '2026-09-20', answers: { correct: 2 }, rounds: 1, breakdown: [{ dimension: 'mode', key: 'week', answers: { correct: 2 }, rounds: 1 }] });
    expect(localStorage.getItem('euskalduo.stats.pending.v1')).toBeNull();
  });

  it('sends at most 100 breakdown rows per request and keeps the rest for the next one', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    for (let i = 0; i < 130; i++) reportAnswer('correct', '2026-09-24', { set: `set-${i}`, exercise: 'spell', mode: 'topic' });
    await flushStats();
    const tries = fetchMock.mock.calls.length;
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await flushStats();

    const sent = bodies().slice(tries);
    expect(sent.map((b) => b.breakdown.length)).toEqual([100, 34]);
    expect(sent.map((b) => b.answers?.correct ?? 0)).toEqual([130, 0]);
    expect(sent.flatMap((b) => b.breakdown).filter((p: { dimension: string }) => p.dimension === 'set')).toHaveLength(130);
  });

  it('counts nothing from a browser that is left out, until it is counted again', async () => {
    setStatsExcluded(true);
    expect(statsExcluded()).toBe(true);
    reportAnswer('correct', '2026-09-24', { set: 'week-1', exercise: 'spell', mode: 'topic' });
    reportRound('2026-09-24');
    await flushStats();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('euskalduo.stats.pending.v1')).toBeNull();
    expect(localStorage.getItem('euskalduo.stats.v1'), 'not even flagged as a device').toBeNull();

    setStatsExcluded(false);
    reportAnswer('correct', '2026-09-24');
    await flushStats();
    expect(bodies()).toEqual([{ day: '2026-09-24', newDevice: true, activeToday: true, activeWeek: true, answers: { correct: 1 } }]);
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
