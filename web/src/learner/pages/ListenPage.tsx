import { Link } from 'react-router-dom';
import { difficultyLabel, durationLabel, t } from '../../i18n';
import type { Story } from '../../types';
import { useLearner } from '../LearnerContext';
import { storyPath } from '../routes';
import { todayIso } from '../scheduler';
import { recommendStory, storyState } from '../story';

const STATE_LABEL = { new: 'storyNew', heard: 'storyHeard', supported: 'storySupported', understood: 'storyUnderstood' } as const;

/** The listening section: every published story, chosen freely, with a suggestion. */
export function ListenPage() {
  const { stories, state, sets } = useLearner();
  const recommended = recommendStory(stories, state, sets ?? [], todayIso());
  const short = stories.filter((s) => s.format === 'short');
  const extended = stories.filter((s) => s.format === 'extended');

  return (
    <div>
      <h1>🎧 {t('listenTitle')}</h1>
      <p className="lead">{t('listenIntro')}</p>
      {stories.length === 0 && <p className="card center-note">{t('noStories')}</p>}
      {recommended && (
        <Link className="action-card action-listen" to={storyPath(recommended)}>
          <span className="action-icon" aria-hidden="true">⭐</span>
          <span className="action-title">{t('listenRecommended', { title: recommended.title })}</span>
          <span className="action-sub">{storyMeta(recommended)}</span>
        </Link>
      )}
      {extended.length > 0 && <StoryList title={t('listenExtended')} stories={extended} />}
      {short.length > 0 && <StoryList title={t('listenShort')} stories={short} />}
    </div>
  );
}

function storyMeta(story: Story): string {
  return [difficultyLabel(story.difficulty), durationLabel(story.durationMs)].filter(Boolean).join(' · ');
}

function StoryList({ title, stories }: { title: string; stories: Story[] }) {
  const { state } = useLearner();
  return (
    <section>
      <h2>{title}</h2>
      <ul className="week-list">
        {stories.map((story) => (
          <li key={story.id}>
            <Link className="week-card story-card" to={storyPath(story)}>
              <span className="week-title">{story.title}</span>
              <span className="week-meta">{storyMeta(story)}</span>
              <span className={`badge badge-story-${storyState(state.stories[story.id])}`}>{t(STATE_LABEL[storyState(state.stories[story.id])])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
