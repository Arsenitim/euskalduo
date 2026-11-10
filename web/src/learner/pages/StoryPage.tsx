import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { reportAnswer, reportRound } from '../../api/stats';
import { t } from '../../i18n';
import { Stars } from '../components/bits';
import { Mascot } from '../components/Mascot';
import { StoryBlock } from '../components/StoryBlock';
import { useLearner } from '../LearnerContext';
import { starsFor } from '../questions';
import { todayIso } from '../scheduler';
import { recordStory, shuffledOptions, storyPoints, type StoryResult } from '../story';

/** One story from the listening section, as a block of its own. */
export function StoryPage() {
  const { storyId } = useParams();
  const { stories, state, update } = useLearner();
  const story = stories.find((s) => s.id === storyId);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<StoryResult | null>(null);
  const [order, setOrder] = useState(() => (story ? shuffledOptions(story, Math.random) : []));

  if (!story) {
    return (
      <p className="card center-note">
        {t('noStories')} <Link to="/escuchar">{t('back')}</Link>
      </p>
    );
  }

  const onDone = (r: StoryResult) => {
    const today = todayIso();
    if (r.status !== 'unavailable') {
      const tags = { story: story.id, exercise: 'listening', mode: 'listening' } as const;
      if (r.status === 'done') for (const right of r.answers) reportAnswer(right ? (r.supported ? 'hinted' : 'correct') : 'wrong', today, tags);
      else reportAnswer('skipped', today, tags);
      reportRound(today, { sets: [], stories: [story.id], mode: 'listening' });
      update((s) => ({ ...s, stories: { ...s.stories, [story.id]: recordStory(s.stories[story.id], r, today)! } }));
    }
    setResult(r);
  };

  if (result) {
    const points = storyPoints(result);
    const stars = points === null ? 0 : starsFor(points, 1);
    return (
      <div className="card summary">
        {points !== null && (
          <>
            <div className="summary-mascots">
              <Mascot kind="hedgehog" state={stars >= 2 ? 'cheer' : 'hint'} />
              <Mascot kind="sheep" state={stars >= 2 ? 'cheer' : 'hint'} />
            </div>
            <Stars count={stars} big />
          </>
        )}
        <h1>{story.title}</h1>
        <p className="lead">{result.status === 'skipped' ? t('storySkipped') : result.status === 'unavailable' ? t('storyNoAudio') : stars === 3 ? t('greatJob') : t('keepGoing')}</p>
        <div className="button-row">
          <button className="btn btn-primary btn-big" onClick={() => { setResult(null); setOrder(shuffledOptions(story, Math.random)); setAttempt((n) => n + 1); }}>
            🔁 {t('storyRestart')}
          </button>
          <Link className="btn btn-big" to="/escuchar">
            {t('storyAnother')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="practice">
      <div className="practice-top">
        <Link className="btn btn-small" to="/escuchar">
          ← {t('back')}
        </Link>
      </div>
      <div className="card question-card" key={attempt}>
        <StoryBlock story={story} optionOrder={order} lang={state.lang} sound={state.sound} onDone={onDone} />
      </div>
    </div>
  );
}
