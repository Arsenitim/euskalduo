import { Link } from 'react-router-dom';
import { t, wordCount } from '../../i18n';
import { ProgressBar, SampleBadge, Stars } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { setPath } from '../routes';
import { setProgress } from '../setProgress';

export function CategoriesPage() {
  const { topics, state } = useLearner();
  return (
    <div>
      <h1>{t('categoriesTitle')}</h1>
      <p className="lead">{t('categoriesIntro')}</p>
      {topics.length === 0 && <p className="card center-note">{t('noCategories')}</p>}
      <ul className="week-list">
        {topics.map((set) => {
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
    </div>
  );
}
