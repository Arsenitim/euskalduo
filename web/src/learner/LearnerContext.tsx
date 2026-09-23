import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchContent } from '../api/public';
import type { HomeworkSet } from '../types';
import { clearState, emptyState, loadState, saveState, type LearnerState } from './progress';

interface LearnerContextValue {
  sets: HomeworkSet[] | null;
  error: boolean;
  reload: () => void;
  state: LearnerState;
  update: (fn: (state: LearnerState) => LearnerState) => void;
  reset: () => void;
  storageOk: boolean;
  currentSet: HomeworkSet | null;
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
        // Newest week first; the server already orders, this keeps it explicit.
        setSets([...content.sets].sort((a, b) => b.weekStart.localeCompare(a.weekStart)));
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
    const pinned = sets?.find((s) => s.id === state.pinnedWeek);
    return {
      sets,
      error,
      reload: () => {
        setError(false);
        setAttempt((n) => n + 1);
      },
      state,
      update,
      reset,
      storageOk,
      currentSet: pinned ?? sets?.[0] ?? null,
    };
  }, [sets, error, state, update, reset, storageOk]);

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>;
}

export function useLearner(): LearnerContextValue {
  const value = useContext(LearnerContext);
  if (!value) throw new Error('useLearner outside LearnerProvider');
  return value;
}
