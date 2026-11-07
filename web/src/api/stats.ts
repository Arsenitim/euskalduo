/**
 * Anonymous usage counters, sent only while practising. Each answer (right,
 * with a hint, wrong or skipped) and each finished round adds one to a
 * counter for that day, plus at most once ever "this is a new device" and
 * once a day "this device practised today". There is no device id: the
 * browser only remembers locally that it already counted those two flags.
 * Names, answers, words and progress are never sent.
 *
 * Counters wait in localStorage until the server confirms them, so practice
 * without a connection (e.g. on a plane) is reported, under the day it
 * happened, once the device is back online.
 */
export type AnswerResult = 'correct' | 'hinted' | 'wrong' | 'skipped';

const FLAGS_KEY = 'euskalduo.stats.v1';
const QUEUE_KEY = 'euskalduo.stats.pending.v1';
const RESULTS: AnswerResult[] = ['correct', 'hinted', 'wrong', 'skipped'];
/** The server accepts at most this much per counter and request (StatsController). */
const MAX_PER_REQUEST = 500;
/** Older days beyond this many are dropped instead of piling up forever. */
const MAX_DAYS = 60;

interface Counts {
  newDevice?: true;
  activeToday?: true;
  answers: Record<AnswerResult, number>;
  rounds: number;
}

/** Pending counters by day (YYYY-MM-DD, the device's date). */
type Queue = Record<string, Counts>;

interface StatsBody {
  day?: string;
  newDevice?: true;
  activeToday?: true;
  answers?: Partial<Record<AnswerResult, number>>;
  rounds?: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const empty = (): Counts => ({ answers: { correct: 0, hinted: 0, wrong: 0, skipped: 0 }, rounds: 0 });
const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0);

function loadQueue(): Queue {
  const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '{}') as unknown;
  const queue: Queue = {};
  if (!raw || typeof raw !== 'object') return queue;
  for (const [day, value] of Object.entries(raw as Record<string, Partial<Counts>>)) {
    if (!DAY.test(day) || !value || typeof value !== 'object') continue;
    const c = empty();
    if (value.newDevice === true) c.newDevice = true;
    if (value.activeToday === true) c.activeToday = true;
    for (const r of RESULTS) c.answers[r] = count(value.answers?.[r]);
    c.rounds = count(value.rounds);
    queue[day] = c;
  }
  return queue;
}

function saveQueue(queue: Queue): void {
  const days = Object.keys(queue).sort().slice(-MAX_DAYS);
  if (days.length === 0) localStorage.removeItem(QUEUE_KEY);
  else localStorage.setItem(QUEUE_KEY, JSON.stringify(Object.fromEntries(days.map((d) => [d, queue[d]]))));
}

function isEmpty(c: Counts): boolean {
  return !c.newDevice && !c.activeToday && c.rounds === 0 && RESULTS.every((r) => c.answers[r] === 0);
}

function merge(into: Counts, add: Counts): void {
  if (add.newDevice) into.newDevice = true;
  if (add.activeToday) into.activeToday = true;
  for (const r of RESULTS) into.answers[r] += add.answers[r];
  into.rounds += add.rounds;
}

/** Device flags due today; remembered at once so each is counted only once. */
function dueFlags(today: string): Pick<Counts, 'newDevice' | 'activeToday'> {
  const stored = JSON.parse(localStorage.getItem(FLAGS_KEY) ?? 'null') as { counted?: unknown; activeDay?: unknown } | null;
  const due = { ...(stored?.counted !== true && { newDevice: true as const }), ...(stored?.activeDay !== today && { activeToday: true as const }) };
  localStorage.setItem(FLAGS_KEY, JSON.stringify({ counted: true, activeDay: today }));
  return due;
}

function post(body: StatsBody): Promise<Response> {
  return fetch('/api/public/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    keepalive: true,
  });
}

function toBody(day: string, c: Counts): StatsBody {
  const answers = Object.fromEntries(RESULTS.filter((r) => c.answers[r] > 0).map((r) => [r, c.answers[r]]));
  return {
    day,
    ...(c.newDevice && { newDevice: true }),
    ...(c.activeToday && { activeToday: true }),
    ...(Object.keys(answers).length > 0 && { answers }),
    ...(c.rounds > 0 && { rounds: c.rounds }),
  };
}

/** Takes up to one request's worth out of `c`, leaving the rest in it. */
function takeChunk(c: Counts): Counts {
  const chunk = empty();
  if (c.newDevice) chunk.newDevice = true;
  if (c.activeToday) chunk.activeToday = true;
  delete c.newDevice;
  delete c.activeToday;
  for (const r of RESULTS) {
    chunk.answers[r] = Math.min(MAX_PER_REQUEST, c.answers[r]);
    c.answers[r] -= chunk.answers[r];
  }
  chunk.rounds = Math.min(MAX_PER_REQUEST, c.rounds);
  c.rounds -= chunk.rounds;
  return chunk;
}

let flushing: Promise<void> | null = null;

/**
 * Sends waiting counters, oldest day first. Each chunk is taken out of the
 * queue before it is sent and put back if sending fails, so counters added
 * meanwhile (or in another tab) are never lost or sent twice.
 */
export function flushStats(): Promise<void> {
  if (flushing) return flushing;
  const run = (async () => {
    try {
      for (;;) {
        const queue = loadQueue();
        const day = Object.keys(queue).sort()[0];
        if (!day) return;
        const pending = queue[day]!;
        const chunk = takeChunk(pending);
        if (isEmpty(pending)) delete queue[day];
        saveQueue(queue);
        if (isEmpty(chunk)) continue;
        let response: Response | null = null;
        try {
          response = await post(toBody(day, chunk));
        } catch {
          response = null;
        }
        // Rejected outright (4xx): drop it rather than retry forever. Otherwise keep it for later.
        if (response && (response.ok || (response.status >= 400 && response.status < 500))) continue;
        const now = loadQueue();
        merge((now[day] ??= empty()), chunk);
        saveQueue(now);
        return;
      }
    } catch {
      // Storage unavailable: nothing can be queued.
    }
  })();
  // .finally always runs later, so this cannot clear `flushing` before it is set.
  flushing = run.finally(() => {
    flushing = null;
  });
  return flushing;
}

function record(today: string, add: (c: Counts) => void): void {
  try {
    const queue = loadQueue();
    const c = (queue[today] ??= empty());
    merge(c, { ...empty(), ...dueFlags(today) });
    add(c);
    saveQueue(queue);
  } catch {
    // Without storage nothing can wait for a connection, and every answer would
    // look like a new device: send this one now, without device flags.
    const c = empty();
    add(c);
    post(toBody(today, c)).catch(() => undefined);
    return;
  }
  void flushStats();
}

export function reportAnswer(result: AnswerResult, today: string): void {
  record(today, (c) => c.answers[result]++);
}

export function reportRound(today: string): void {
  record(today, (c) => c.rounds++);
}

/** Sends what is waiting now and whenever the connection comes back. */
export function startStatsSync(): () => void {
  const flush = () => void flushStats();
  flush();
  window.addEventListener('online', flush);
  return () => window.removeEventListener('online', flush);
}
