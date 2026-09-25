import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportAnswer, reportRound } from './stats';

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

  it('flags a new device once and an active day once per day, with no identifier', () => {
    reportAnswer('correct', '2026-09-24');
    reportAnswer('hinted', '2026-09-24');
    reportRound('2026-09-24');
    reportAnswer('skipped', '2026-09-25');

    expect(bodies()).toEqual([
      { newDevice: true, activeToday: true, answers: { correct: 1 } },
      { answers: { hinted: 1 } },
      { rounds: 1 },
      { activeToday: true, answers: { skipped: 1 } },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/public/stats');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true });
  });

  it('sends no device flags when the browser cannot store them', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    reportAnswer('wrong', '2026-09-24');
    reportAnswer('wrong', '2026-09-24');

    expect(bodies()).toEqual([{ answers: { wrong: 1 } }, { answers: { wrong: 1 } }]);
  });
});
