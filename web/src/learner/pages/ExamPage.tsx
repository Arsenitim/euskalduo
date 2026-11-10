import { Link, useParams } from 'react-router-dom';
import { examLabel, t } from '../../i18n';
import { ProgressBar } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { examPracticePath } from '../routes';
import { todayIso } from '../scheduler';
import { setProgress } from '../setProgress';
import { WordList } from './CollectionPage';

/**
 * Exam preparation: the sets chosen for one exam. Practice from here
 * drills every item of them, ignoring the review calendar. The same
 * material keeps appearing in ordinary lessons too.
 */
export function ExamPage() {
  const { examId } = useParams();
  const { sets, state, exams } = useLearner();
  // Old links used the set id; migrated exams keep that id.
  const exam = exams.find((e) => e.id === examId) ?? exams.find((e) => e.setIds.length === 1 && e.setIds[0] === examId);
  const examSets = (sets ?? []).filter((s) => exam?.setIds.includes(s.id));
  if (!exam || examSets.length === 0) {
    return (
      <p className="card center-note">
        {t('noContent')} <Link to="/">{t('home')}</Link>
      </p>
    );
  }
  const totals = examSets.map((set) => setProgress(set, state)).reduce((a, p) => ({ learned: a.learned + p.learned, total: a.total + p.total }), { learned: 0, total: 0 });

  return (
    <div>
      <p>
        <Link to="/">← {t('back')}</Link>
      </p>
      <h1>
        <span aria-hidden="true">📝</span> {t('examTitle')}: {exam.title}
      </h1>
      {exam.examDate !== null && <p className="lead">{examLabel(exam.examDate, todayIso())}</p>}
      <p>{t('examIntro')}</p>
      <ProgressBar value={totals.learned} max={totals.total} label={t('learned', { n: totals.learned, total: totals.total })} />
      <div className="button-row">
        <Link className="btn btn-primary btn-big" to={examPracticePath(exam)}>
          {t('examPractice')}
        </Link>
      </div>
      {examSets.map((set) => (
        <section key={set.id}>
          <h2>{set.title}</h2>
          <WordList set={set} lang={state.lang} />
        </section>
      ))}
      <p className="muted">{t('examGoodLuck')}</p>
    </div>
  );
}
