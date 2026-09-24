export type Lang = 'es' | 'ru';

export interface Group {
  key: string;
  title: string;
  ordered: boolean;
}

export interface Entry {
  id: string;
  basque: string;
  translations: { es: string[]; ru?: string[] };
  note: string | null;
  group: string | null;
  emoji: string | null;
  image: string | null;
}

/** "week": homework for one school week. "topic": a category (months, weekdays…) with no week. */
export type SetKind = 'week' | 'topic';

export interface HomeworkSet {
  id: string;
  kind: SetKind;
  title: string;
  weekStart: string | null;
  description: string | null;
  sample: boolean;
  groups: Group[];
  entries: Entry[];
}

export type WeekSet = HomeworkSet & { kind: 'week'; weekStart: string };

export const isWeek = (set: HomeworkSet): set is WeekSet => set.kind === 'week' && set.weekStart !== null;

export interface Content {
  schemaVersion: number;
  sets: HomeworkSet[];
}
