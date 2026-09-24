import { Link } from 'react-router-dom';
import { t, weekLabel } from '../../i18n';
import { ProgressBar, SampleBadge, Stars } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { setPath } from '../routes';
import { setProgress } from '../setProgress';

export function ProgressPage() {
  const { weeks, topics, state } = useLearner();
  const rows = [...weeks, ...topics].map((set) => ({ set, p: setProgress(set, state) }));
  const learned = rows.reduce((n, r) => n + r.p.learned, 0);
  const total = rows.reduce((n, r) => n + r.p.total, 0);

  return (
    <div>
      <h1>{t('progressTitle')}</h1>
      <div className="card">
        <ProgressBar value={learned} max={total} label={t('learned', { n: learned, total })} />
        <p className="muted">{t('progressLocal')}</p>
      </div>
      <ul className="week-list">
        {rows.map(({ set, p }) => (
          <li key={set.id}>
            <Link className="week-card" to={setPath(set)}>
              <span className="week-date">{set.kind === 'week' && set.weekStart !== null ? weekLabel(set.weekStart) : t('category')}</span>
              <span className="week-title">
                {set.title} {set.sample && <SampleBadge />}
              </span>
              <span className="week-meta">
                {t('practiced', { n: p.practiced })} · {t('rounds', { n: p.rounds })} · {t('bestStars')}: <Stars count={p.stars} />
              </span>
              <ProgressBar value={p.learned} max={p.total} label={t('learned', { n: p.learned, total: p.total })} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
