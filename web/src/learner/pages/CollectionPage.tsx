import { Link, useParams } from 'react-router-dom';
import { examLabel, receivedLabel, t } from '../../i18n';
import type { Entry, HomeworkSet, Lang } from '../../types';
import { VoiceButton } from '../components/Voice';
import { ProgressBar, SampleBadge, WordVisual } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { meaningsOf } from '../questions';
import { examPath, practicePath } from '../routes';
import { todayIso } from '../scheduler';
import { setProgress } from '../setProgress';

/** A school sheet or a topic: its words, progress and "practise". */
export function CollectionPage() {
  const { setId } = useParams();
  const { sets, state, exams } = useLearner();
  const set = sets?.find((s) => s.id === setId);
  if (!set) {
    return (
      <p className="card center-note">
        {t('noContent')} <Link to="/temas">{t('back')}</Link>
      </p>
    );
  }
  const p = setProgress(set, state);
  const relatedExams = exams.filter((e) => e.setIds.includes(set.id));

  return (
    <div>
      <p>
        <Link to="/temas">← {t('back')}</Link>
      </p>
      <h1>
        {set.title} {set.sample && <SampleBadge />}
      </h1>
      <p className="lead">{set.kind === 'sheet' ? (set.receivedOn ? receivedLabel(set.receivedOn) : t('sheet')) : t('category')}</p>
      {set.description && <p>{set.description}</p>}
      {relatedExams.map((exam) => (
        <p key={exam.id}>
          <Link className="badge badge-exam" to={examPath(exam)}>
            <span aria-hidden="true">📝</span> {exam.examDate ? examLabel(exam.examDate, todayIso()) : t('examPrepare')}
          </Link>
        </p>
      ))}
      <ProgressBar value={p.learned} max={p.total} label={t('learned', { n: p.learned, total: p.total })} />
      <div className="button-row">
        <Link className="btn btn-primary btn-big" to={practicePath(set)}>
          {t('practice')}
        </Link>
      </div>
      <h2>{t('wordList')}</h2>
      <WordList set={set} lang={state.lang} />
    </div>
  );
}

/** Words in their stored order; ordered groups are shown as numbered lists. */
export function WordList({ set, lang }: { set: HomeworkSet; lang: Lang }) {
  const ungrouped = set.entries.filter((e) => !e.group || !set.groups.some((g) => g.key === e.group));
  return (
    <>
      {set.groups.map((group) => {
        const entries = set.entries.filter((e) => e.group === group.key);
        if (entries.length === 0) return null;
        const List = group.ordered ? 'ol' : 'ul';
        return (
          <section key={group.key} className="word-group">
            {group.title !== set.title && <h3>{group.title}</h3>}
            <List className="word-grid">
              {entries.map((e) => (
                <WordCard key={e.id} entry={e} lang={lang} />
              ))}
            </List>
          </section>
        );
      })}
      {ungrouped.length > 0 && (
        <ul className="word-grid">
          {ungrouped.map((e) => (
            <WordCard key={e.id} entry={e} lang={lang} />
          ))}
        </ul>
      )}
    </>
  );
}

function WordCard({ entry, lang }: { entry: Entry; lang: Lang }) {
  return (
    <li className="word-card">
      <WordVisual entry={entry} size="small" />
      <span className="word-basque" lang="eu">
        {entry.basque}
      </span>
      <VoiceButton entries={[entry]} />
      <span className="word-meaning" lang={lang}>
        {meaningsOf(entry, lang).join(' / ')}
      </span>
      {entry.note && <span className="word-note">{entry.note}</span>}
    </li>
  );
}
