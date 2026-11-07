import { Link } from 'react-router-dom';
import { examLabel, t, weekLabel, wordCount } from '../../i18n';
import { SampleBadge } from '../components/bits';
import { OfflineNotice, UpdatePill } from '../components/Offline';
import { useLearner } from '../LearnerContext';
import { examPath, practicePath } from '../routes';
import { todayIso } from '../scheduler';

export function HomePage() {
  const { weeks, topics, examSets, state, currentSet } = useLearner();
  const name = state.displayName.trim();
  const hasPrevious = weeks.length > 1;

  return (
    <div className="home">
      <h1 className="greeting">{name ? t('helloName', { name }) : t('hello')}</h1>
      <p className="lead">{t('homeQuestion')}</p>
      <OfflineNotice />
      <UpdatePill />
      {!currentSet && topics.length === 0 && examSets.length === 0 ? (
        <p className="card center-note">{t('noContent')}</p>
      ) : (
        <div className="home-actions">
          {examSets.map((set) => (
            <Link key={set.id} className="action-card action-exam" to={examPath(set)}>
              <span className="action-icon" aria-hidden="true">📝</span>
              <span className="action-title">{t('examPrepare')}</span>
              <span className="action-sub">
                {examLabel(set.examDate!, todayIso())} · {set.title} {set.sample && <SampleBadge />}
              </span>
              <span className="action-sub">
                {t('examPrepareHint')} · {wordCount(set.entries.length)}
              </span>
            </Link>
          ))}
          {currentSet && (
            <>
              <Link className="action-card action-week" to={practicePath(currentSet)}>
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
            </>
          )}
          {topics.length > 0 && (
            <Link className="action-card action-topics" to="/categorias">
              <span className="action-icon" aria-hidden="true">🧩</span>
              <span className="action-title">{t('categories')}</span>
              <span className="action-sub">{t('categoriesHint')}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
