import { Link } from 'react-router-dom';
import { t, weekLabel, wordCount } from '../../i18n';
import { SampleBadge } from '../components/bits';
import { useLearner } from '../LearnerContext';

export function HomePage() {
  const { sets, state, currentSet } = useLearner();
  const name = state.displayName.trim();
  const hasPrevious = (sets?.length ?? 0) > 1;

  return (
    <div className="home">
      <h1 className="greeting">{name ? t('helloName', { name }) : t('hello')}</h1>
      <p className="lead">{t('homeQuestion')}</p>
      {!currentSet ? (
        <p className="card center-note">{t('noContent')}</p>
      ) : (
        <div className="home-actions">
          <Link className="action-card action-week" to={`/practicar?modo=semana&id=${currentSet.id}`}>
            <span className="action-icon" aria-hidden="true">🎒</span>
            <span className="action-title">{t('thisWeek')}</span>
            <span className="action-sub">
              {currentSet.title} {currentSet.sample && <SampleBadge />}
            </span>
            <span className="action-sub">
              {weekLabel(currentSet.weekStart)} · {wordCount(currentSet.entries.length)}
            </span>
          </Link>
          <Link className="action-card action-choose" to="/semanas">
            <span className="action-icon" aria-hidden="true">📅</span>
            <span className="action-title">{t('chooseWeek')}</span>
            <span className="action-sub">{t('chooseWeekHint')}</span>
          </Link>
          {hasPrevious && (
            <Link className="action-card action-mix" to="/mezclar">
              <span className="action-icon" aria-hidden="true">🔀</span>
              <span className="action-title">{t('mixWeeks')}</span>
              <span className="action-sub">{t('mixWeeksHint')}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
