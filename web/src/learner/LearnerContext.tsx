import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { mediaUrls, pruneMedia } from '../api/offline';
import { fetchContent } from '../api/public';
import { startStatsSync } from '../api/stats';
import type { Exam, HomeworkSet, Story } from '../types';
import { learnerSets } from './display';
import { clearState, emptyState, loadState, saveState, type LearnerState } from './progress';
import { todayIso } from './scheduler';

interface LearnerContextValue {
  /** Every published set (sheets and topics): one catalogue for practice and progress. */
  sets: HomeworkSet[] | null;
  /** School sheets, by title (dates never decide the order). */
  sheets: HomeworkSet[];
  /** Topics (days of the week, months, sentences…), by title. */
  topics: HomeworkSet[];
  /** Published listening stories with audio. */
  stories: Story[];
  /** Exams without a date or with a date today or later, soonest first. */
  exams: Exam[];
  error: boolean;
  reload: () => void;
  state: LearnerState;
  update: (fn: (state: LearnerState) => LearnerState) => void;
  reset: () => void;
  storageOk: boolean;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [sets, setSets] = useState<HomeworkSet[] | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LearnerState>(() => loadState());
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchContent()
      .then((content) => {
        if (cancelled) return;
        setSets(learnerSets(content.sets));
        setStories(content.stories.filter((story) => story.audio));
        setExams(content.exams);
        setError(false);
        // Pictures and speech that left the catalogue need not stay on the device.
        pruneMedia(mediaUrls(content.sets, content.stories)).catch(() => undefined);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Counters from practice without a connection are sent once it is back.
  useEffect(() => startStatsSync(), []);

  const update = useCallback((fn: (s: LearnerState) => LearnerState) => {
    setState((previous) => {
      const next = fn(previous);
      setStorageOk(saveState(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    clearState();
    setState(emptyState());
  }, []);

  const value = useMemo<LearnerContextValue>(() => {
    const byTitle = (a: HomeworkSet, b: HomeworkSet) => a.title.localeCompare(b.title, 'eu');
    const sheets = (sets ?? []).filter((s) => s.kind === 'sheet').sort(byTitle);
    const topics = (sets ?? []).filter((s) => s.kind === 'topic').sort(byTitle);
    const today = todayIso();
    const ids = new Set((sets ?? []).map((s) => s.id));
    const activeExams = exams
      .filter((e) => (e.examDate === null || e.examDate >= today) && e.setIds.some((id) => ids.has(id)))
      .sort((a, b) => (a.examDate ?? '9999').localeCompare(b.examDate ?? '9999'));
    return {
      sets,
      sheets,
      topics,
      stories,
      exams: activeExams,
      error,
      reload: () => {
        setError(false);
        setAttempt((n) => n + 1);
      },
      state,
      update,
      reset,
      storageOk,
    };
  }, [sets, stories, exams, error, state, update, reset, storageOk]);

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

export function useLearner(): LearnerContextValue {
  const value = useContext(LearnerContext);
  if (!value) throw new Error('useLearner outside LearnerProvider');
  return value;
}
