import { Link } from 'react-router-dom';
import { t, weekLabel, wordCount } from '../../i18n';
import { ProgressBar, SampleBadge, Stars } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { setProgress } from '../setProgress';

export function WeeksPage() {
  const { sets, state, currentSet } = useLearner();
  return (
    <div>
      <h1>{t('weeksTitle')}</h1>
      {sets?.length === 0 && <p className="card center-note">{t('noContent')}</p>}
      <ul className="week-list">
        {sets?.map((set) => {
          const p = setProgress(set, state);
          return (
            <li key={set.id}>
              <Link className="week-card" to={`/semana/${set.id}`}>
                <span className="week-date">{weekLabel(set.weekStart)}</span>
                <span className="week-title">
                  {set.title} {set.sample && <SampleBadge />}
                  {set.id === currentSet?.id && <span className="badge badge-current">{t('current')}</span>}
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
