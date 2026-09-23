import { Link, useParams } from 'react-router-dom';
import { t, weekLabel } from '../../i18n';
import type { Entry, HomeworkSet, Lang } from '../../types';
import { ProgressBar, SampleBadge, WordVisual } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { meaningsOf } from '../questions';
import { setProgress } from '../setProgress';

export function WeekPage() {
  const { setId } = useParams();
  const { sets, state, update, currentSet } = useLearner();
  const set = sets?.find((s) => s.id === setId);
  if (!set) {
    return (
      <p className="card center-note">
        {t('noContent')} <Link to="/semanas">{t('back')}</Link>
      </p>
    );
  }
  const p = setProgress(set, state);
  const isCurrent = currentSet?.id === set.id;

  return (
    <div>
      <p>
        <Link to="/semanas">← {t('back')}</Link>
      </p>
      <h1>
        {set.title} {set.sample && <SampleBadge />}
      </h1>
      <p className="lead">{weekLabel(set.weekStart)}</p>
      {set.description && <p>{set.description}</p>}
      <ProgressBar value={p.learned} max={p.total} label={t('learned', { n: p.learned, total: p.total })} />
      <div className="button-row">
        <Link className="btn btn-primary btn-big" to={`/practicar?modo=semana&id=${set.id}`}>
          {t('practice')}
        </Link>
        {isCurrent ? (
          <span className="badge badge-current">{t('isCurrent')}</span>
        ) : (
          <button className="btn" onClick={() => update((s) => ({ ...s, pinnedWeek: set.id }))}>
            {t('useAsCurrent')}
          </button>
        )}
      </div>
      <h2>{t('wordList')}</h2>
      <WordList set={set} lang={state.lang} />
    </div>
  );
}

/** Words in their stored order; ordered groups are shown as numbered lists. */
function WordList({ set, lang }: { set: HomeworkSet; lang: Lang }) {
  const ungrouped = set.entries.filter((e) => !e.group || !set.groups.some((g) => g.key === e.group));
  return (
    <>
      {set.groups.map((group) => {
        const entries = set.entries.filter((e) => e.group === group.key);
        if (entries.length === 0) return null;
        const List = group.ordered ? 'ol' : 'ul';
        return (
          <section key={group.key} className="word-group">
            <h3>{group.title}</h3>
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
      <span className="word-meaning" lang={lang}>
        {meaningsOf(entry, lang).join(' / ')}
      </span>
      {entry.note && <span className="word-note">{entry.note}</span>}
    </li>
  );
}
