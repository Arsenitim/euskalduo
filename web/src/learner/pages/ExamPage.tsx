import { Link, useParams } from 'react-router-dom';
import { examLabel, t } from '../../i18n';
import { ProgressBar, SampleBadge } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { examPracticePath } from '../routes';
import { todayIso } from '../scheduler';
import { setProgress } from '../setProgress';
import { WordList } from './WeekPage';

/**
 * Exam preparation: everything that comes up in one announced school exam.
 * Practice from here drills every word of the set, ignoring the review
 * calendar, so nothing on the sheet is left out before the exam day.
 */
export function ExamPage() {
  const { setId } = useParams();
  const { sets, state } = useLearner();
  const set = sets?.find((s) => s.id === setId);
  if (!set) {
    return (
      <p className="card center-note">
        {t('noContent')} <Link to="/">{t('home')}</Link>
      </p>
    );
  }
  const p = setProgress(set, state);

  return (
    <div>
      <p>
        <Link to="/">← {t('back')}</Link>
      </p>
      <h1>
        <span aria-hidden="true">📝</span> {t('examTitle')}: {set.title} {set.sample && <SampleBadge />}
      </h1>
      {set.examDate !== null && <p className="lead">{examLabel(set.examDate, todayIso())}</p>}
      <p>{t('examIntro')}</p>
      <ProgressBar value={p.learned} max={p.total} label={t('learned', { n: p.learned, total: p.total })} />
      <div className="button-row">
        <Link className="btn btn-primary btn-big" to={examPracticePath(set)}>
          {t('examPractice')}
        </Link>
      </div>
      <h2>{t('wordList')}</h2>
      <WordList set={set} lang={state.lang} />
      <p className="muted">{t('examGoodLuck')}</p>
    </div>
  );
}
