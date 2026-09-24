import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchContent } from '../api/public';
import { isWeek, type HomeworkSet, type WeekSet } from '../types';
import { clearState, emptyState, loadState, saveState, type LearnerState } from './progress';

interface LearnerContextValue {
  /** Every published set (weeks and categories), for practice and progress. */
  sets: HomeworkSet[] | null;
  /** Homework weeks, newest first. */
  weeks: WeekSet[];
  /** Categories (days of the week, months…), by title. */
  topics: HomeworkSet[];
  error: boolean;
  reload: () => void;
  state: LearnerState;
  update: (fn: (state: LearnerState) => LearnerState) => void;
  reset: () => void;
  storageOk: boolean;
  currentSet: WeekSet | null;
}

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [sets, setSets] = useState<HomeworkSet[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LearnerState>(() => loadState());
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchContent()
      .then((content) => {
        if (cancelled) return;
        setSets(content.sets);
        setError(false);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

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
    // Newest week first; the server already orders, this keeps it explicit.
    const weeks = (sets ?? []).filter(isWeek).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const topics = (sets ?? []).filter((s) => s.kind === 'topic').sort((a, b) => a.title.localeCompare(b.title, 'eu'));
    const pinned = weeks.find((s) => s.id === state.pinnedWeek);
    return {
      sets,
      weeks,
      topics,
      error,
      reload: () => {
        setError(false);
        setAttempt((n) => n + 1);
      },
      state,
      update,
      reset,
      storageOk,
      currentSet: pinned ?? weeks[0] ?? null,
    };
  }, [sets, error, state, update, reset, storageOk]);

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

export function useLearner(): LearnerContextValue {
  const value = useContext(LearnerContext);
  if (!value) throw new Error('useLearner outside LearnerProvider');
  return value;
}
