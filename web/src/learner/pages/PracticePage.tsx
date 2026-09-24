import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { t } from '../../i18n';
import type { HomeworkSet, Lang } from '../../types';
import { ProgressBar, Stars } from '../components/bits';
import { ChoiceQuestionView, OrderQuestionView, SpellQuestionView, TypeMeaningView, type Outcome } from '../components/questions';
import { useLearner } from '../LearnerContext';
import { buildRound, meaningsOf, retryQuestion, starsFor, type Item, type Mode, type Question } from '../questions';
import type { LearnerState } from '../progress';
import { recordAnswer, todayIso } from '../scheduler';
import { playCorrect, playRoundDone, playWrong } from '../sounds';

const MAX_RETRIES = 4;
const RETRY_GAP = 3;

interface Session {
  round: number;
  questions: Question[];
  index: number;
  outcome: Outcome | null;
  firstTry: Record<string, boolean>;
  answeredWords: string[];
  retried: string[];
  missed: Item[];
  done: boolean;
}

function parseMode(params: URLSearchParams, sets: HomeworkSet[]): Mode | null {
  if (params.get('modo') === 'semana' || params.get('modo') === 'categoria') {
    const id = params.get('id');
    return id && sets.some((s) => s.id === id) ? { kind: 'week', setId: id } : null;
  }
  if (params.get('modo') === 'mezcla') {
    const ids = (params.get('ids') ?? '').split(',').filter((id) => sets.some((s) => s.id === id));
    return ids.length > 0 ? { kind: 'mix', setIds: ids } : null;
  }
  return null;
}

function newSession(sets: HomeworkSet[], mode: Mode, state: LearnerState, round: number): Session {
  const questions = buildRound({ sets, mode, stats: state.entries, today: todayIso(), lang: state.lang, rng: Math.random });
  return { round, questions, index: 0, outcome: null, firstTry: {}, answeredWords: [], retried: [], missed: [], done: questions.length === 0 };
}

export function PracticePage() {
  const [params] = useSearchParams();
  const { sets, state, update } = useLearner();
  const mode = parseMode(params, sets ?? []);
  const [session, setSession] = useState<Session | null>(() => (mode && sets ? newSession(sets, mode, state, 1) : null));

  if (!mode || !session || !sets) {
    return (
      <p className="card center-note">
        {t('noContent')} <Link to="/">{t('home')}</Link>
      </p>
    );
  }

  const question = session.questions[session.index];

  const onAnswer = (outcome: Outcome) => {
    if (!question || session.outcome) return;
    const correct = outcome.verdict !== 'wrong';
    if (state.sound) (correct ? playCorrect : playWrong)();
    const next: Session = { ...session, outcome, firstTry: { ...session.firstTry } };

    if (question.kind === 'order') {
      next.firstTry[question.id] = correct;
    } else {
      const key = question.item.key;
      if (!question.retry) next.firstTry[question.id] = correct;
      // Only the first answer to a word in a round moves it between boxes.
      if (!question.retry && !session.answeredWords.includes(key)) {
        next.answeredWords = [...session.answeredWords, key];
        const today = todayIso();
        update((s) => ({ ...s, entries: { ...s.entries, [key]: recordAnswer(s.entries[key], correct, today) } }));
      }
      if (!correct) {
        if (!session.missed.some((i) => i.key === key)) next.missed = [...session.missed, question.item];
        if (!question.retry && !session.retried.includes(key) && session.retried.length < MAX_RETRIES) {
          const questions = [...session.questions];
          questions.splice(Math.min(session.index + RETRY_GAP, questions.length), 0, retryQuestion(question, sets, state.lang, Math.random));
          next.questions = questions;
          next.retried = [...session.retried, key];
        }
      }
    }
    setSession(next);
  };

  const goNext = () => {
    const index = session.index + 1;
    if (index < session.questions.length) {
      setSession({ ...session, index, outcome: null });
      return;
    }
    const scored = Object.values(session.firstTry);
    const stars = starsFor(scored.filter(Boolean).length, scored.length);
    const today = todayIso();
    const setIds = mode.kind === 'week' ? [mode.setId] : mode.setIds;
    update((s) => {
      const updated = { ...s.sets };
      for (const id of setIds) {
        const previous = updated[id];
        updated[id] = { rounds: (previous?.rounds ?? 0) + 1, bestStars: Math.max(previous?.bestStars ?? 0, stars), last: today };
      }
      return { ...s, sets: updated };
    });
    setSession({ ...session, done: true, outcome: null });
  };

  if (session.done) {
    return <RoundSummary session={session} lang={state.lang} sound={state.sound} onAgain={() => setSession(newSession(sets, mode, state, session.round + 1))} />;
  }
  if (!question) return null;

  const total = session.questions.length;
  const common = { lang: state.lang, answered: session.outcome !== null, onAnswer };

  return (
    <div className="practice">
      <div className="practice-top">
        <ProgressBar value={session.index + (session.outcome ? 1 : 0)} max={total} label={t('questionOf', { n: session.index + 1, total })} />
        <button
          className="btn btn-small"
          aria-pressed={state.sound}
          aria-label={state.sound ? t('soundOn') : t('soundOff')}
          title={state.sound ? t('soundOn') : t('soundOff')}
          onClick={() => update((s) => ({ ...s, sound: !s.sound }))}
        >
          <span aria-hidden="true">{state.sound ? '🔊' : '🔇'}</span>
        </button>
        <Link className="btn btn-small" to="/">
          {t('exit')}
        </Link>
      </div>
      <div className="card question-card" key={`${session.round}-${question.id}`}>
        {question.kind !== 'order' && question.retry && <span className="badge badge-retry">{t('retryBadge')}</span>}
        {question.kind === 'meaning-choice' || question.kind === 'basque-choice' ? (
          <ChoiceQuestionView question={question} {...common} />
        ) : question.kind === 'spell' ? (
          <SpellQuestionView question={question} {...common} />
        ) : question.kind === 'type-meaning' ? (
          <TypeMeaningView question={question} {...common} />
        ) : (
          <OrderQuestionView question={question} {...common} />
        )}
      </div>
      {session.outcome && <Feedback question={question} outcome={session.outcome} lang={state.lang} willRetry={session.questions.some((q) => q.id === `${question.id}-retry`)} onNext={goNext} />}
    </div>
  );
}

function correctAnswer(question: Question, lang: Lang): string {
  switch (question.kind) {
    case 'meaning-choice':
    case 'type-meaning':
      return meaningsOf(question.item.entry, lang).join(' / ');
    case 'basque-choice':
    case 'spell':
      return question.item.entry.basque;
    case 'order':
      return question.items.map((i) => i.entry.basque).join(' → ');
  }
}

function Feedback({ question, outcome, lang, willRetry, onNext }: { question: Question; outcome: Outcome; lang: Lang; willRetry: boolean; onNext: () => void }) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const answerLang = question.kind === 'meaning-choice' || question.kind === 'type-meaning' ? lang : 'eu';
  const cls = outcome.verdict === 'wrong' ? 'feedback feedback-wrong' : 'feedback feedback-right';

  return (
    <div className={cls} role="status">
      <span className="feedback-icon" aria-hidden="true">
        {outcome.verdict === 'wrong' ? '🤔' : '🎉'}
      </span>
      <div className="feedback-text">
        {outcome.verdict === 'exact' ? (
          <strong>{t('correct')}</strong>
        ) : (
          <>
            <strong>{outcome.verdict === 'almost' ? t('almost') : t('wrong')}</strong>{' '}
            <span className="feedback-answer" lang={answerLang}>
              {correctAnswer(question, lang)}
            </span>
            {willRetry && <small className="feedback-note">{t('tryAgainLater')}</small>}
          </>
        )}
      </div>
      <button ref={nextRef} className="btn btn-primary" onClick={onNext}>
        {t('next')} →
      </button>
    </div>
  );
}

function RoundSummary({ session, lang, sound, onAgain }: { session: Session; lang: Lang; sound: boolean; onAgain: () => void }) {
  useEffect(() => {
    if (sound) playRoundDone();
    // Only once, when the summary appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scored = Object.values(session.firstTry);
  const right = scored.filter(Boolean).length;
  const stars = starsFor(right, scored.length);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="card summary">
      {!reducedMotion && <Confetti />}
      <h1>{t('roundDone')}</h1>
      <Stars count={stars} big />
      <p className="lead">{stars === 3 ? t('greatJob') : stars === 2 ? t('goodJob') : t('keepGoing')}</p>
      <p>{t('firstTry', { n: right, total: scored.length })}</p>
      {session.missed.length > 0 && (
        <>
          <h2>{t('wordsToReview')}</h2>
          <ul className="review-list">
            {session.missed.map((item) => (
              <li key={item.key}>
                <span lang="eu">
                  <strong>{item.entry.basque}</strong>
                </span>{' '}
                — <span lang={lang}>{meaningsOf(item.entry, lang).join(' / ')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="button-row">
        <button className="btn btn-primary btn-big" onClick={onAgain} autoFocus>
          {t('playAgain')}
        </button>
        <Link className="btn btn-big" to="/">
          {t('home')}
        </Link>
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ['#ffd23f', '#1f7a5a', '#ee4266', '#3bceac', '#540d6e'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 9) * 0.12}s`,
            animationDuration: `${2.2 + (i % 5) * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}
