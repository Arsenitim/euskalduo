import { useEffect, useRef, useState } from 'react';
import { fetchAudio } from '../../api/audio';
import { difficultyLabel, durationLabel, t } from '../../i18n';
import type { Lang, Story } from '../../types';
import { stopSounds } from '../sounds';
import type { StoryResult } from '../story';
import { stopVoice } from '../voice';

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

/**
 * The story recording, separate from the word voice: starting it stops any
 * word audio, and nothing else plays while it does. Nothing starts on its
 * own; the learner presses "Escuchar".
 */
function useStoryPlayer(url: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [state, setState] = useState<PlayerState>('idle');

  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const start = async (fromBeginning: boolean) => {
    stopVoice();
    stopSounds();
    if (audio.current) {
      if (fromBeginning) audio.current.currentTime = 0;
      await audio.current.play().then(() => setState('playing'), () => setState('error'));
      return;
    }
    setState('loading');
    try {
      const blob = await fetchAudio(url);
      objectUrl.current = URL.createObjectURL(blob);
      const player = new Audio();
      player.preload = 'auto';
      player.src = objectUrl.current;
      player.onended = () => setState('ended');
      player.onerror = () => setState('error');
      player.onpause = () => setState((s) => (s === 'playing' ? 'paused' : s));
      audio.current = player;
      await player.play();
      setState('playing');
    } catch {
      setState('error');
    }
  };

  return {
    state,
    play: () => void start(false),
    restart: () => void start(true),
    pause: () => audio.current?.pause(),
    stop: () => audio.current?.pause(),
  };
}

interface Props {
  story: Story;
  optionOrder: number[][];
  lang: Lang;
  /** Global sound setting: when off, the learner must start the story explicitly anyway. */
  sound: boolean;
  onDone: (result: StoryResult) => void;
}

/**
 * One listening block: instructions, playback, questions in the chosen
 * meaning language, then feedback with the text and its translation.
 */
export function StoryBlock({ story, optionOrder, lang, sound, onDone }: Props) {
  const player = useStoryPlayer(story.audio);
  const [allowWhileMuted, setAllowWhileMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(() => story.questions.map(() => null));
  const [textOpen, setTextOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const answeredAll = answers.every((a) => a !== null);
  const results = answers.map((a, i) => (a === null ? null : a === story.questions[i]!.correct));
  const right = results.filter((r) => r === true).length;
  const finish = (status: StoryResult['status']) => {
    player.stop();
    onDone({ status, answers: status === 'done' ? results : [], supported });
  };

  const toggleText = () => {
    // Opening the text before every answer is given makes this supported practice.
    if (!textOpen && !answeredAll) setSupported(true);
    setTextOpen(!textOpen);
  };

  const play = () => {
    setStarted(true);
    player.play();
  };

  const muted = !sound && !allowWhileMuted;
  const length = durationLabel(story.durationMs);

  return (
    <div className="story-block">
      <span className="badge badge-story">🎧 {t('storyBadge')}</span>
      <h2 className="prompt-title" tabIndex={-1} ref={titleRef}>
        {story.title}
      </h2>
      <p className="muted">
        {difficultyLabel(story.difficulty)}
        {length && ` · ${length}`}
      </p>
      <p>{t('storyInstructions')}</p>

      {player.state === 'error' ? (
        <div className="card story-notice" role="status">
          <p>{t('storyNoAudio')}</p>
          <button className="btn btn-primary" onClick={() => finish('unavailable')}>
            {t('storyContinue')} →
          </button>
        </div>
      ) : muted ? (
        <div className="card story-notice">
          <p>🔇 {t('storyMuted')}</p>
          <div className="button-row">
            <button className="btn btn-primary" onClick={() => setAllowWhileMuted(true)}>
              🔊 {t('storyPlayAnyway')}
            </button>
            <button className="btn" onClick={() => finish('skipped')}>
              {t('storySkip')}
            </button>
          </div>
        </div>
      ) : (
        <div className="story-controls button-row" role="group" aria-label={t('storyBadge')}>
          {player.state === 'playing' ? (
            <button className="btn btn-big" onClick={player.pause}>
              ⏸ {t('storyPause')}
            </button>
          ) : (
            <button className="btn btn-primary btn-big" onClick={play} disabled={player.state === 'loading'}>
              ▶️ {player.state === 'loading' ? t('storyLoading') : player.state === 'paused' ? t('storyResume') : t('storyPlay')}
            </button>
          )}
          {started && player.state !== 'loading' && (
            <button className="btn" onClick={player.restart}>
              🔁 {t('storyRestart')}
            </button>
          )}
          {!answeredAll && (
            <button className="btn btn-link" onClick={() => finish('skipped')}>
              {t('storySkip')}
            </button>
          )}
        </div>
      )}

      {started && player.state !== 'error' && (
        <ol className="story-questions">
          {story.questions.map((question, qi) => {
            const chosen = answers[qi];
            const done = chosen !== null && chosen !== undefined;
            return (
              <li key={question.id} className="story-question">
                <p className="story-question-prompt" lang={lang}>
                  <span className="muted">{t('storyQuestion', { n: qi + 1, total: story.questions.length })}</span>
                  <br />
                  <strong>{question.prompt[lang]}</strong>
                </p>
                <div className="options" role="group" aria-label={question.prompt[lang]}>
                  {(optionOrder[qi] ?? question.options.map((_, i) => i)).map((oi, position) => {
                    const option = question.options[oi]!;
                    const state = !done ? '' : oi === question.correct ? 'is-correct' : oi === chosen ? 'is-wrong' : 'is-dim';
                    return (
                      <button
                        key={oi}
                        className={`option ${state}`}
                        aria-disabled={done}
                        lang={lang}
                        onClick={() => !done && setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                      >
                        <span className="option-key" aria-hidden="true">
                          {position + 1}
                        </span>
                        <span className="option-label">{option[lang]}</span>
                        {done && oi === question.correct && <span className="option-mark" aria-label="correcta">✓</span>}
                        {done && oi === chosen && oi !== question.correct && <span className="option-mark" aria-label="incorrecta">✗</span>}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {started && (
        <div className="story-text">
          <button className="btn btn-small" aria-expanded={textOpen} onClick={toggleText}>
            📄 {textOpen ? t('storyHideText') : t('storyShowText')}
          </button>
          {!answeredAll && !textOpen && <small className="muted"> {t('storyTextNote')}</small>}
          {textOpen && (
            <div className="card story-transcript">
              <p lang="eu">{story.transcript}</p>
              <h3>{t('storyTranslation')}</h3>
              <p lang={lang}>{story.translations[lang]}</p>
            </div>
          )}
        </div>
      )}

      {answeredAll && (
        <div className={right === story.questions.length ? 'feedback feedback-right' : 'feedback feedback-wrong'} role="status">
          <span className="feedback-icon" aria-hidden="true">
            {right === story.questions.length ? '🎉' : '👂'}
          </span>
          <div className="feedback-text">
            <strong>{supported ? t('storyDoneSupported', { n: right, total: story.questions.length }) : t('storyDone', { n: right, total: story.questions.length })}</strong>
          </div>
          <button className="btn btn-primary" onClick={() => finish('done')} autoFocus>
            {t('next')} →
          </button>
        </div>
      )}
    </div>
  );
}
