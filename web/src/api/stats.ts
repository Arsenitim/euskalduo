/**
 * Anonymous usage counters, sent only while practising. Each request says
 * "one more answer" (right, with a hint, wrong or skipped) or "one more
 * finished round", and at most once ever "this is a new device" and once a
 * day "this device practised today". There is no device id: the browser only
 * remembers locally that it already sent those two flags. Names, answers,
 * words and progress are never sent.
 */
export type AnswerResult = 'correct' | 'hinted' | 'wrong' | 'skipped';

const STORAGE_KEY = 'euskalduo.stats.v1';

interface Flags {
  counted: boolean;
  activeDay: string | null;
}

interface StatsBody {
  newDevice?: true;
  activeToday?: true;
  answers?: Partial<Record<AnswerResult, 1>>;
  rounds?: 1;
}

/** Device flags due with this report; marked as sent right away so they are sent once. */
function dueFlags(today: string): Pick<StatsBody, 'newDevice' | 'activeToday'> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Flags> | null;
    const flags: Flags = { counted: stored?.counted === true, activeDay: typeof stored?.activeDay === 'string' ? stored.activeDay : null };
    const due = { ...(!flags.counted && { newDevice: true as const }), ...(flags.activeDay !== today && { activeToday: true as const }) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ counted: true, activeDay: today }));
    return due;
  } catch {
    // Without storage every answer would look like a new device: send no flags at all.
    return {};
  }
}

function send(body: StatsBody): void {
  fetch('/api/public/stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    keepalive: true,
  }).catch(() => undefined);
}

export function reportAnswer(result: AnswerResult, today: string): void {
  send({ ...dueFlags(today), answers: { [result]: 1 } });
}

export function reportRound(today: string): void {
  send({ ...dueFlags(today), rounds: 1 });
}
