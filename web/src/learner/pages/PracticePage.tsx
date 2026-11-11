import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchAudio } from '../../api/audio';
import { reportAnswer, reportRound, type PracticeMode } from '../../api/stats';
import { t } from '../../i18n';
import type { Exam, HomeworkSet, Lang } from '../../types';
import { Stars } from '../components/bits';
import { FeedbackButton } from '../components/FeedbackDialog';
import { SeaProgress } from '../components/Seascape';
import { Mascot } from '../components/Mascot';
import { WordBuildQuestionView, ChoiceQuestionView, GrammarChoiceView, OrderQuestionView, SentenceBuildView, SpellQuestionView, TypeMeaningView, type Outcome } from '../components/questions';
import { StoryBlock } from '../components/StoryBlock';
import { useLearner } from '../LearnerContext';
import { LESSON } from '../lessonConfig';
import { newMascotTracker, nextMascot, type MascotShow, type MascotTracker } from '../mascot';
import { buildRound, meaningsOf, pointsFor, retryPosition, retryQuestion, skillOf, starsFor, type Item, type Mode, type Question, type StoryBlock as StoryBlockQuestion } from '../questions';
import { recordSkill, type LearnerState } from '../progress';
import { recordAnswer, todayIso } from '../scheduler';
import { recordStory, storyPoints, type StoryResult } from '../story';
import { VoiceButton } from '../components/Voice';
import { promptVoiceEntries, answerVoiceEntries } from '../voicePolicy';
import { playVoice, setVoiceEnabled, stopVoice } from '../voice';
import { playCorrect, playRoundDone, playWrong, stopSounds } from '../sounds';

interface Session {
  round: number;
  questions: Question[];
  index: number;
  outcome: Outcome | null;
  /** Points per question for its first answer: 1, ½ with a hint, 0. A story block scores as one question. */
  firstTry: Record<string, number>;
  answeredWords: string[];
  retried: string[];
  missed: Item[];
  /** Stories played in this round (for the round counters). */
  stories: string[];
  mascot: MascotTracker;
  /** The mascot reacting to the current answer, if it is its turn. */
  shown: MascotShow | null;
  done: boolean;
}

/** Reads the mode from the URL. Old exam links (#/examen/<setId>) still resolve. */
export function parseMode(params: URLSearchParams, sets: HomeworkSet[], exams: Exam[]): Mode | null {
  const modo = params.get('modo');
  const id = params.get('id');
  if ((modo === 'tema' || modo === 'semana' || modo === 'categoria') && id && sets.some((s) => s.id === id)) return { kind: 'collection', setId: id };
  if (modo === 'examen' && id) {
    const exam = exams.find((e) => e.id === id);
    if (exam) return { kind: 'exam', setIds: exam.setIds.filter((sid) => sets.some((s) => s.id === sid)) };
    if (sets.some((s) => s.id === id)) return { kind: 'exam', setIds: [id] };
  }
  if (modo === 'mezcla') return { kind: 'lesson' };
  return null;
}

/** The practice mode as counted in the anonymous usage stats. */
function practiceMode(mode: Mode): PracticeMode {
  return mode.kind === 'lesson' ? 'lesson' : mode.kind === 'exam' ? 'exam' : 'topic';
}

function newSession(sets: HomeworkSet[], mode: Mode, state: LearnerState, stories: Parameters<typeof buildRound>[0]['stories'], round: number): Session {
  const questions = buildRound({ sets, mode, stats: state.entries, today: todayIso(), lang: state.lang, rng: Math.random, stories, learner: state });
  return { round, questions, index: 0, outcome: null, firstTry: {}, answeredWords: [], retried: [], missed: [], stories: [], mascot: newMascotTracker(Math.random), shown: null, done: questions.length === 0 };
}

/** "Empezar" (lesson), a topic or sheet, or an exam: all rounds run here. */
export function PracticePage({ lesson = false }: { lesson?: boolean }) {
  const [params] = useSearchParams();
  const { sets, state, update, stories, exams } = useLearner();
  const mode: Mode | null = lesson ? { kind: 'lesson' } : parseMode(params, sets ?? [], exams);
  const [session, setSession] = useState<Session | null>(() => (mode && sets ? newSession(sets, mode, state, stories, 1) : null));

  if (!mode || !session || !sets) {
    return (
      <p className="card center-note">
        {t('noContent')} <Link to="/">{t('home')}</Link>
      </p>
    );
  }

  const question = session.questions[session.index];
  const hasStory = session.questions.some((q) => q.kind === 'story');

  const onAnswer = (outcome: Outcome) => {
    if (!question || question.kind === 'story' || session.outcome) return;
    const correct = outcome.verdict !== 'wrong';
    stopVoice();
    stopSounds();
    if (state.sound) {
      setVoiceEnabled(true);
      (correct ? playCorrect : playWrong)();
      playVoice(answerVoiceEntries(question).map((entry) => entry.audio), 550);
    }
    reportAnswer(correct ? (outcome.hinted ? 'hinted' : 'correct') : outcome.skipped ? 'skipped' : 'wrong', todayIso(), {
      set: question.kind === 'order' ? question.setId : question.item.setId,
      exercise: question.kind,
      mode: practiceMode(mode),
    });
    const retry = question.kind !== 'order' && question.retry;
    const mascot = nextMascot(session.mascot, { correct, hinted: outcome.hinted, almost: outcome.verdict === 'almost', skipped: outcome.skipped, retry }, Math.random);
    const next: Session = { ...session, outcome, firstTry: { ...session.firstTry }, mascot: mascot.tracker, shown: mascot.show };

    if (question.kind === 'order') {
      next.firstTry[question.id] = pointsFor(correct, false);
    } else {
      const key = question.item.key;
      const hinted = outcome.hinted === true;
      const today = todayIso();
      if (!question.retry) next.firstTry[question.id] = pointsFor(correct, hinted);
      // Only the first answer to an item in a round moves it between boxes.
      const moveBox = !question.retry && !session.answeredWords.includes(key);
      const skill = question.retry ? null : skillOf(question.kind);
      if (moveBox) next.answeredWords = [...session.answeredWords, key];
      if (moveBox || skill) {
        update((s) => ({
          ...s,
          entries: moveBox ? { ...s.entries, [key]: recordAnswer(s.entries[key], !correct ? 'wrong' : hinted ? 'hinted' : 'correct', today) } : s.entries,
          // Each skill keeps its own record: recognising a word does not mean spelling it.
          skills: skill ? { ...s.skills, [key]: { ...s.skills[key], [skill]: recordSkill(s.skills[key]?.[skill], correct && !hinted, today) } } : s.skills,
        }));
      }
      if (!correct) {
        if (!session.missed.some((i) => i.key === key)) next.missed = [...session.missed, question.item];
        const maxRetries = hasStory ? LESSON.maxRetriesWithStory : LESSON.maxRetries;
        if (!question.retry && !session.retried.includes(key) && session.retried.length < maxRetries) {
          const questions = [...session.questions];
          questions.splice(retryPosition(questions, session.index), 0, retryQuestion(question, sets, state.lang, Math.random));
          next.questions = questions;
          next.retried = [...session.retried, key];
        }
      }
    }
    setSession(next);
  };

  const finishRound = (current: Session) => {
    const scored = Object.values(current.firstTry);
    const stars = starsFor(sum(scored), scored.length);
    const today = todayIso();
    const setIds = mode.kind === 'collection' ? [mode.setId] : mode.kind === 'exam' ? mode.setIds : [];
    reportRound(today, { sets: setIds, stories: current.stories, mode: practiceMode(mode) });
    update((s) => {
      const updated = { ...s.sets };
      for (const id of setIds) {
        const previous = updated[id];
        updated[id] = { rounds: (previous?.rounds ?? 0) + 1, bestStars: Math.max(previous?.bestStars ?? 0, stars), last: today };
      }
      return { ...s, sets: updated };
    });
    setSession({ ...current, done: true, outcome: null, shown: null });
  };

  const goNext = (current: Session = session) => {
    stopVoice();
    stopSounds();
    const index = current.index + 1;
    if (index < current.questions.length) {
      setSession({ ...current, index, outcome: null, shown: null });
      return;
    }
    finishRound(current);
  };

  const onStoryDone = (block: StoryBlockQuestion, result: StoryResult) => {
    const today = todayIso();
    const points = storyPoints(result);
    const next: Session = { ...session, firstTry: { ...session.firstTry }, stories: result.status === 'unavailable' ? session.stories : [...session.stories, block.story.id] };
    // Skipped or unplayable: not scored, so it can never lower the stars.
    if (points !== null) next.firstTry[block.id] = points;
    if (result.status !== 'unavailable') {
      const tags = { story: block.story.id, exercise: 'listening', mode: practiceMode(mode) } as const;
      if (result.status === 'done') for (const right of result.answers) reportAnswer(right ? (result.supported ? 'hinted' : 'correct') : 'wrong', today, tags);
      else reportAnswer('skipped', today, tags);
      // Only the story's own record changes; word boxes stay as they are.
      update((s) => ({ ...s, stories: { ...s.stories, [block.story.id]: recordStory(s.stories[block.story.id], result, today)! } }));
    }
    goNext(next);
  };

  if (session.done) {
    return <RoundSummary session={session} lang={state.lang} sound={state.sound} onAgain={() => setSession(newSession(sets, mode, state, stories, session.round + 1))} />;
  }
  if (!question) return null;

  const total = session.questions.length;
  const common = { lang: state.lang, answered: session.outcome !== null, onAnswer };

  return (
    <div className="practice">
      <div className="practice-top lesson-top">
        <Link className="lesson-exit" to="/" aria-label={t('exit')} title={t('exit')}>
          <span aria-hidden="true">✕</span>
        </Link>
        <span className="lesson-count">{t('questionOf', { n: session.index + 1, total })}</span>
        <button
          className="btn btn-small lesson-tool"
          aria-pressed={state.sound}
          aria-label={state.sound ? t('soundOn') : t('soundOff')}
          title={state.sound ? t('soundOn') : t('soundOff')}
          onClick={() => { setVoiceEnabled(!state.sound); stopSounds(); update((s) => ({ ...s, sound: !s.sound })); }}
        >
          <span aria-hidden="true">{state.sound ? '🔊' : '🔇'}</span>
        </button>
        <FeedbackButton compact />
      </div>
      <div className="card question-card" key={`${session.round}-${question.id}`}>
        {question.kind === 'story' ? (
          <StoryBlock story={question.story} optionOrder={question.optionOrder} lang={state.lang} sound={state.sound} onDone={(result) => onStoryDone(question, result)} />
        ) : (
          <>
            <QuestionVoice question={question} round={session.round} />
            {question.kind !== 'order' && question.retry && <span className="badge badge-retry">{t('retryBadge')}</span>}
            {question.kind === 'meaning-choice' || question.kind === 'basque-choice' ? (
              <ChoiceQuestionView question={question} {...common} />
            ) : question.kind === 'word-build' ? (
              <WordBuildQuestionView question={question} {...common} />
            ) : question.kind === 'spell' ? (
              <SpellQuestionView question={question} {...common} />
            ) : question.kind === 'type-meaning' ? (
              <TypeMeaningView question={question} {...common} />
            ) : question.kind === 'sentence-build' ? (
              <SentenceBuildView question={question} {...common} />
            ) : question.kind === 'grammar-choice' ? (
              <GrammarChoiceView question={question} {...common} />
            ) : (
              <OrderQuestionView question={question} {...common} />
            )}
          </>
        )}
      </div>
      <div className="practice-dock">
        {session.outcome && question.kind !== 'story' && (
          <Feedback question={question} outcome={session.outcome} mascot={session.shown} lang={state.lang} willRetry={session.questions.some((q) => q.id === `${question.id}-retry`)} onNext={() => goNext()} />
        )}
        <SeaProgress value={session.index + (session.outcome ? 1 : 0)} max={total} label={t('questionOf', { n: session.index + 1, total })} />
      </div>
    </div>
  );
}

function QuestionVoice({ question, round }: { question: Question; round: number }) {
  const { state } = useLearner();
  const entries = promptVoiceEntries(question);
  const url = entries[0]?.audio;
  // A zero-delay task prevents the discarded Strict Mode mount from speaking.
  useEffect(() => {
    if (state.sound && url) void fetchAudio(url).catch(() => {});
    const timer = setTimeout(() => {
      if (state.sound && url) playVoice([url]);
    }, 0);
    return () => { clearTimeout(timer); stopVoice(); };
    // Changing mute does not replay a prompt; only a fresh question does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, round]);
  return entries.length > 0 ? <VoiceButton entries={entries} /> : null;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function correctAnswer(question: Question, lang: Lang): string {
  switch (question.kind) {
    case 'meaning-choice':
    case 'type-meaning':
      return meaningsOf(question.item.entry, lang).join(' / ');
    case 'basque-choice':
    case 'word-build':
    case 'spell':
    case 'sentence-build':
    case 'grammar-choice':
      return question.item.entry.basque;
    case 'order':
      return question.items.map((i) => i.entry.basque).join(' → ');
    case 'story':
      return '';
  }
}

function Feedback({ question, outcome, mascot, lang, willRetry, onNext }: { question: Exclude<Question, StoryBlockQuestion>; outcome: Outcome; mascot: MascotShow | null; lang: Lang; willRetry: boolean; onNext: () => void }) {
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);
  const answerLang = question.kind === 'meaning-choice' || question.kind === 'type-meaning' ? lang : 'eu';
  const cls = outcome.verdict === 'wrong' ? 'feedback feedback-wrong' : 'feedback feedback-right';

  return (
    <div className={cls} role="status">
      {mascot && <Mascot kind={mascot.kind} state={mascot.state} className="feedback-mascot" />}
      <div className="feedback-text">
        {outcome.verdict === 'exact' ? (
          <strong>{outcome.hinted ? t('correctWithHint') : t('correct')}</strong>
        ) : (
          <>
            <strong>{outcome.verdict === 'almost' ? t('almost') : outcome.skipped ? t('skippedAnswer') : t('wrong')}</strong>{' '}
            <span className="feedback-answer" lang={answerLang}>
              {correctAnswer(question, lang)}
            </span>
            {willRetry && <small className="feedback-note">{t('tryAgainLater')}</small>}
          </>
        )}
      </div>
      <span className="feedback-word" lang="eu">
        {question.kind !== 'order' && (outcome.verdict === 'exact' || answerLang !== 'eu') && <strong>{question.item.entry.basque}</strong>}
        <VoiceButton entries={answerVoiceEntries(question)} />
      </span>
      <button ref={nextRef} className="btn btn-next" onClick={onNext}>
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
  const right = scored.filter((p) => p > 0).length;
  const hints = scored.filter((p) => p > 0 && p < 1).length;
  const stars = starsFor(sum(scored), scored.length);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="card summary">
      {!reducedMotion && <Confetti />}
      <div className="summary-mascots">
        <Mascot kind="hedgehog" state={stars >= 2 ? 'cheer' : 'hint'} />
        <Mascot kind="sheep" state={stars >= 2 ? 'cheer' : 'hint'} />
      </div>
      <h1>{t('roundDone')}</h1>
      <Stars count={stars} big />
      <p className="lead">{stars === 3 ? t('greatJob') : stars === 2 ? t('goodJob') : t('keepGoing')}</p>
      <p>{hints > 0 ? t('firstTryHints', { n: right, total: scored.length, hints }) : t('firstTry', { n: right, total: scored.length })}</p>
      {session.missed.length > 0 && (
        <>
          <h2>{t('wordsToReview')}</h2>
          <ul className="review-list">
            {session.missed.map((item) => (
              <li key={item.key}>
                <span lang="eu">
                  <strong>{item.entry.basque}</strong>
                </span>{' '}
                <VoiceButton entries={[item.entry]} /> — <span lang={lang}>{meaningsOf(item.entry, lang).join(' / ')}</span>
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
