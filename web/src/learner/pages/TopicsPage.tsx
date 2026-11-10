import { Link } from 'react-router-dom';
import { t, wordCount } from '../../i18n';
import type { HomeworkSet } from '../../types';
import { ProgressBar, SampleBadge, Stars } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { setPath } from '../routes';
import { setProgress } from '../setProgress';

/** Topic practice: built-in topics and every school sheet, by title. */
export function TopicsPage() {
  const { topics, sheets } = useLearner();
  return (
    <div>
      <h1>{t('topicsTitle')}</h1>
      <p className="lead">{t('topicsIntro')}</p>
      {topics.length + sheets.length === 0 && <p className="card center-note">{t('noTopics')}</p>}
      {topics.length > 0 && (
        <>
          <h2>{t('topicsSection')}</h2>
          <CollectionList sets={topics} />
        </>
      )}
      {sheets.length > 0 && (
        <>
          <h2>{t('sheetsSection')}</h2>
          <CollectionList sets={sheets} />
        </>
      )}
    </div>
  );
}

export function CollectionList({ sets }: { sets: HomeworkSet[] }) {
  const { state } = useLearner();
  return (
    <ul className="week-list">
      {sets.map((set) => {
        const p = setProgress(set, state);
        return (
          <li key={set.id}>
            <Link className="week-card" to={setPath(set)}>
              {set.description && <span className="week-date">{set.description}</span>}
              <span className="week-title">
                {set.title} {set.sample && <SampleBadge />}
              </span>
              <span className="week-meta">
                {wordCount(p.total)} · <Stars count={p.stars} />
              </span>
              <ProgressBar value={p.learned} max={p.total} label={t('learned', { n: p.learned, total: p.total })} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
