import { Link } from 'react-router-dom';
import { examLabel, t } from '../../i18n';
import { Icon } from '../components/Icons';
import { Landscape } from '../components/Landscape';
import { OfflineNotice, UpdatePill } from '../components/Offline';
import { useLearner } from '../LearnerContext';
import { examPath, LESSON_PATH } from '../routes';
import { todayIso } from '../scheduler';
import { recommendStory } from '../story';

/**
 * One big button starts a lesson chosen for the learner; topics and
 * listening are there for when a child wants something specific.
 */
export function HomePage() {
  const { sets, topics, sheets, stories, exams, state } = useLearner();
  const name = state.displayName.trim();
  const today = todayIso();
  const hasMaterial = (sets ?? []).some((s) => s.entries.length > 0);
  const recommended = recommendStory(stories, state, sets ?? [], today);

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hello">
          <h1 className="greeting">{name ? t('helloName', { name }) : t('hello')}</h1>
          <p className="lead">{t('homeQuestion')}</p>
        </div>
        <Landscape />
      </div>
      <div className="home-sea">
        <OfflineNotice />
        <UpdatePill />
        {!hasMaterial ? (
          <p className="card center-note">{t('noContent')}</p>
        ) : (
          <>
            {/* The boat: its painted registration carries the child's name. */}
            <Link className="action-card action-start" to={LESSON_PATH}>
              <span className="action-reg" aria-hidden="true">
                BI-1{name ? ` · ${name.toUpperCase()}` : ''}
              </span>
              <span className="action-title">{t('start')}</span>
              <span className="action-sub">{t('startHint')}</span>
            </Link>
            <div className="home-actions">
              {exams.map((exam) => (
                <Link key={exam.id} className="action-card action-exam" to={examPath(exam)}>
                  <span className="action-title">
                    <Icon name="exam" /> {t('examPrepare')}
                  </span>
                  <span className="action-sub">
                    {exam.examDate ? `${examLabel(exam.examDate, today)} · ` : ''}
                    {exam.title}
                  </span>
                </Link>
              ))}
              {topics.length + sheets.length > 0 && (
                <Link className="action-card action-topics" to="/temas">
                  <span className="action-title">
                    <Icon name="topics" /> {t('topics')}
                  </span>
                  <span className="action-sub">{t('topicsHint')}</span>
                </Link>
              )}
              {stories.length > 0 && (
                <Link className="action-card action-listen" to="/escuchar">
                  <span className="action-title">
                    <Icon name="listen" /> {t('listen')}
                  </span>
                  <span className="action-sub">{recommended ? t('listenRecommended', { title: recommended.title }) : t('listenHint')}</span>
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
