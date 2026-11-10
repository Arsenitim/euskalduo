/**
 * Anonymous usage counters, sent only while practising. Each answer (right,
 * with a hint, wrong or skipped) and each finished round adds one to a
 * counter for that day, plus at most once ever "this is a new device", once
 * a day "this device practised today" and once a week "this device practised
 * this week". There is no device id: the browser only remembers locally that
 * it already counted those flags. The same answer and round counters are also
 * kept per set or story, exercise type, practice mode, online/offline and
 * installed app/browser (fixed labels and public set/story ids only).
 * Names, answers, words and progress are never sent.
 *
 * A browser can be left out (e.g. ours, while testing): see setStatsExcluded.
 *
 * Counters wait in localStorage until the server confirms them, so practice
 * without a connection (e.g. on a plane) is reported, under the day it
 * happened, once the device is back online.
 */
export type AnswerResult = 'correct' | 'hinted' | 'wrong' | 'skipped';
/**
 * lesson: "Empezar". topic: one sheet or topic. listening: the listening
 * section. exam: exam preparation. (Older versions sent "week" and "mix";
 * the server still accepts them for counters that were queued offline.)
 */
export type PracticeMode = 'lesson' | 'topic' | 'listening' | 'exam';
/** What an answer belongs to (breakdown labels the server knows; see UsageStats::DIMENSIONS). */
export interface AnswerTags {
  set?: string;
  story?: string;
  exercise: string;
  mode: PracticeMode;
}
/** What a finished round belongs to; `sets` is empty for mixed lessons. */
export interface RoundTags {
  sets: string[];
  stories?: string[];
  mode: PracticeMode;
}

const FLAGS_KEY = 'euskalduo.stats.v1';
const QUEUE_KEY = 'euskalduo.stats.pending.v1';
const EXCLUDE_KEY = 'euskalduo.stats.exclude.v1';
const RESULTS: AnswerResult[] = ['correct', 'hinted', 'wrong', 'skipped'];
/** The server accepts at most this much per counter and request (StatsController). */
const MAX_PER_REQUEST = 500;
/** The server accepts at most this many breakdown rows per request (StatsController). */
const MAX_PARTS = 100;
/** Older days beyond this many are dropped instead of piling up forever. */
const MAX_DAYS = 60;

interface Part {
  answers: Record<AnswerResult, number>;
  rounds: number;
}

interface Counts extends Part {
  newDevice?: true;
  activeToday?: true;
  activeWeek?: true;
  /** Breakdown rows keyed by JSON [dimension, key]. */
  parts: Record<string, Part>;
}

/** Pending counters by day (YYYY-MM-DD, the device's date). */
type Queue = Record<string, Counts>;

interface PartBody {
  answers?: Partial<Record<AnswerResult, number>>;
  rounds?: number;
}

interface StatsBody extends PartBody {
  day?: string;
  newDevice?: true;
  activeToday?: true;
  activeWeek?: true;
  breakdown?: Array<PartBody & { dimension: string; key: string }>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const emptyPart = (): Part => ({ answers: { correct: 0, hinted: 0, wrong: 0, skipped: 0 }, rounds: 0 });
const empty = (): Counts => ({ ...emptyPart(), parts: {} });
const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0);
const partKey = (dimension: string, key: string) => JSON.stringify([dimension, key]);

function parsePartKey(k: string): [string, string] | null {
  try {
    const v = JSON.parse(k) as unknown;
    return Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string' ? [v[0], v[1]] : null;
  } catch {
    return null;
  }
}

function loadPart(value: Partial<Part> | undefined, into: Part): void {
  for (const r of RESULTS) into.answers[r] = count(value?.answers?.[r]);
  into.rounds = count(value?.rounds);
}

const partEmpty = (p: Part) => p.rounds === 0 && RESULTS.every((r) => p.answers[r] === 0);

function loadQueue(): Queue {
  const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '{}') as unknown;
  const queue: Queue = {};
  if (!raw || typeof raw !== 'object') return queue;
  for (const [day, value] of Object.entries(raw as Record<string, Partial<Counts>>)) {
    if (!DAY.test(day) || !value || typeof value !== 'object') continue;
    const c = empty();
    if (value.newDevice === true) c.newDevice = true;
    if (value.activeToday === true) c.activeToday = true;
    if (value.activeWeek === true) c.activeWeek = true;
    loadPart(value, c);
    if (value.parts && typeof value.parts === 'object') {
      for (const [k, part] of Object.entries(value.parts)) {
        if (!parsePartKey(k) || !part || typeof part !== 'object') continue;
        const p = emptyPart();
        loadPart(part, p);
        if (!partEmpty(p)) c.parts[k] = p;
      }
    }
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
  return !c.newDevice && !c.activeToday && !c.activeWeek && partEmpty(c) && Object.keys(c.parts).length === 0;
}

function mergePart(into: Part, add: Part): void {
  for (const r of RESULTS) into.answers[r] += add.answers[r];
  into.rounds += add.rounds;
}

function merge(into: Counts, add: Counts): void {
  if (add.newDevice) into.newDevice = true;
  if (add.activeToday) into.activeToday = true;
  if (add.activeWeek) into.activeWeek = true;
  mergePart(into, add);
  for (const [k, p] of Object.entries(add.parts)) mergePart((into.parts[k] ??= emptyPart()), p);
}

/** Monday of the week `day` (YYYY-MM-DD) falls in. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Device flags due today; remembered at once so each is counted only once. */
function dueFlags(today: string): Pick<Counts, 'newDevice' | 'activeToday' | 'activeWeek'> {
  const stored = JSON.parse(localStorage.getItem(FLAGS_KEY) ?? 'null') as { counted?: unknown; activeDay?: unknown; activeWeek?: unknown } | null;
  const week = weekOf(today);
  const due = {
    ...(stored?.counted !== true && { newDevice: true as const }),
    ...(stored?.activeDay !== today && { activeToday: true as const }),
    ...(stored?.activeWeek !== week && { activeWeek: true as const }),
  };
  localStorage.setItem(FLAGS_KEY, JSON.stringify({ counted: true, activeDay: today, activeWeek: week }));
  return due;
}

/** Whether this browser is left out of the usage counters. */
export function statsExcluded(): boolean {
  try {
    return localStorage.getItem(EXCLUDE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Leaves this browser out of the usage counters (or counts it again). The
 * admin area turns this on when someone signs in, so our own testing is not
 * counted as learners' practice.
 */
export function setStatsExcluded(excluded: boolean): void {
  try {
    if (excluded) localStorage.setItem(EXCLUDE_KEY, '1');
    else localStorage.removeItem(EXCLUDE_KEY);
  } catch {
    // Without storage nothing is remembered either way.
  }
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

function partBody(p: Part): PartBody {
  const answers = Object.fromEntries(RESULTS.filter((r) => p.answers[r] > 0).map((r) => [r, p.answers[r]]));
  return { ...(Object.keys(answers).length > 0 && { answers }), ...(p.rounds > 0 && { rounds: p.rounds }) };
}

function toBody(day: string, c: Counts): StatsBody {
  const breakdown = Object.entries(c.parts).flatMap(([k, p]) => {
    const parsed = parsePartKey(k);
    return parsed ? [{ dimension: parsed[0], key: parsed[1], ...partBody(p) }] : [];
  });
  return {
    day,
    ...(c.newDevice && { newDevice: true }),
    ...(c.activeToday && { activeToday: true }),
    ...(c.activeWeek && { activeWeek: true }),
    ...partBody(c),
    ...(breakdown.length > 0 && { breakdown }),
  };
}

/** Moves up to MAX_PER_REQUEST of each counter from `from` to `to`. */
function takePart(from: Part, to: Part): void {
  for (const r of RESULTS) {
    to.answers[r] = Math.min(MAX_PER_REQUEST, from.answers[r]);
    from.answers[r] -= to.answers[r];
  }
  to.rounds = Math.min(MAX_PER_REQUEST, from.rounds);
  from.rounds -= to.rounds;
}

/** Takes up to one request's worth out of `c`, leaving the rest in it. */
function takeChunk(c: Counts): Counts {
  const chunk = empty();
  if (c.newDevice) chunk.newDevice = true;
  if (c.activeToday) chunk.activeToday = true;
  if (c.activeWeek) chunk.activeWeek = true;
  delete c.newDevice;
  delete c.activeToday;
  delete c.activeWeek;
  takePart(c, chunk);
  for (const k of Object.keys(c.parts).slice(0, MAX_PARTS)) {
    const p = emptyPart();
    takePart(c.parts[k]!, p);
    chunk.parts[k] = p;
    if (partEmpty(c.parts[k]!)) delete c.parts[k];
  }
  return chunk;
}

/** Online/offline and installed app/browser, at the moment of practice. */
function context(): Array<[string, string]> {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  let app: boolean;
  try {
    app = window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    app = false; // no window (tests) or no matchMedia
  }
  return [
    ['connection', online ? 'online' : 'offline'],
    ['display', app ? 'app' : 'browser'],
  ];
}

function addToParts(c: Counts, labels: Array<[string, string]>, add: (p: Part) => void): void {
  for (const [dimension, key] of labels) add((c.parts[partKey(dimension, key)] ??= emptyPart()));
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

function record(today: string, add: (c: Part) => void, labels: Array<[string, string]>): void {
  if (statsExcluded()) return;
  try {
    const queue = loadQueue();
    const c = (queue[today] ??= empty());
    merge(c, { ...empty(), ...dueFlags(today) });
    add(c);
    addToParts(c, labels, add);
    saveQueue(queue);
  } catch {
    // Without storage nothing can wait for a connection, and every answer would
    // look like a new device: send this one now, without device flags.
    const c = empty();
    add(c);
    addToParts(c, labels, add);
    post(toBody(today, c)).catch(() => undefined);
    return;
  }
  void flushStats();
}

export function reportAnswer(result: AnswerResult, today: string, tags?: AnswerTags): void {
  const labels: Array<[string, string]> = tags
    ? [...(tags.set ? [['set', tags.set] as [string, string]] : []), ...(tags.story ? [['story', tags.story] as [string, string]] : []), ['exercise', tags.exercise], ['mode', tags.mode], ...context()]
    : [];
  record(today, (c) => c.answers[result]++, labels);
}

export function reportRound(today: string, tags?: RoundTags): void {
  const labels: Array<[string, string]> = tags
    ? [...tags.sets.map((id): [string, string] => ['set', id]), ...(tags.stories ?? []).map((id): [string, string] => ['story', id]), ['mode', tags.mode], ...context()]
    : [];
  record(today, (c) => c.rounds++, labels);
}

/** Sends what is waiting now and whenever the connection comes back. */
export function startStatsSync(): () => void {
  const flush = () => void flushStats();
  flush();
  window.addEventListener('online', flush);
  return () => window.removeEventListener('online', flush);
}
