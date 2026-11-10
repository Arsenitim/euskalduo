export type Lang = 'es' | 'ru';

export interface Group {
  key: string;
  title: string;
  ordered: boolean;
}

export interface Formation {
  kind: 'compound' | 'derived';
  parts: [string, string];
}

/** Curated tiles in the correct order; other accepted orders are listed explicitly. */
export interface SentenceExercise {
  tiles: string[];
  alternatives: string[][];
  /** Extra tiles that do not belong in the sentence. */
  distractors: string[];
}

/** A sentence with one gap ("___"), the accepted fillers and curated wrong ones. */
export interface GrammarExercise {
  text: string;
  answers: string[];
  distractors: string[];
}

/** "word": vocabulary. "sentence": sentence building. "grammar": fill the gap. */
export type EntryType = 'word' | 'sentence' | 'grammar';

export interface Entry {
  type?: EntryType;
  sentence?: SentenceExercise | null;
  grammar?: GrammarExercise | null;
  formation?: Formation | null;
  id: string;
  basque: string;
  audio?: string | null;
  translations: { es: string[]; ru?: string[] };
  note: string | null;
  group: string | null;
  emoji: string | null;
  image: string | null;
}

/** "sheet": material from school (formerly a homework week). "topic": a category (months, weekdays…). */
export type SetKind = 'sheet' | 'topic';

export interface HomeworkSet {
  id: string;
  kind: SetKind;
  title: string;
  /** When the sheet arrived, only shown as information. It never decides what is practised. */
  receivedOn: string | null;
  description: string | null;
  sample: boolean;
  groups: Group[];
  entries: Entry[];
}

export interface Localized {
  es: string;
  ru: string;
}

export interface StoryQuestion {
  id: string;
  prompt: Localized;
  options: Localized[];
  /** Index of the right option. */
  correct: number;
}

export type StoryFormat = 'short' | 'extended';

export interface Story {
  id: string;
  title: string;
  format: StoryFormat;
  /** 1 easy, 2 medium, 3 harder. */
  difficulty: number;
  transcript: string;
  translations: Localized;
  questions: StoryQuestion[];
  links: { sets: string[]; entries: string[]; words: string[]; topics: string[] };
  audio: string;
  durationMs: number | null;
}

/** A selection of sets to prepare, with an optional date. */
export interface Exam {
  id: string;
  title: string;
  examDate: string | null;
  setIds: string[];
}

export interface Content {
  schemaVersion: number;
  sets: HomeworkSet[];
  stories: Story[];
  exams: Exam[];
}
