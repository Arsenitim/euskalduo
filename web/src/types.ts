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

export interface HomeworkSet {
  id: string;
  title: string;
  weekStart: string;
  description: string | null;
  sample: boolean;
  groups: Group[];
  entries: Entry[];
}

export interface Content {
  schemaVersion: number;
  sets: HomeworkSet[];
}
