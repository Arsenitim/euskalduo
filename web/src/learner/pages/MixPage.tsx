import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t, weekLabel, wordCount } from '../../i18n';
import { SampleBadge } from '../components/bits';
import { useLearner } from '../LearnerContext';

export function MixPage() {
  const { sets, currentSet } = useLearner();
  const navigate = useNavigate();
  const previous = (sets ?? []).filter((s) => s.id !== currentSet?.id);
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = previous.length > 0 && selected.length === previous.length;

  const toggle = (id: string) => setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <div>
      <h1>{t('mixTitle')}</h1>
      {previous.length === 0 ? (
        <p className="card center-note">{t('noPrevious')}</p>
      ) : (
        <>
          <p className="lead">{t('mixIntro')}</p>
          <label className="check-card check-all">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : previous.map((s) => s.id))} />
            <span>{t('allPrevious')}</span>
          </label>
          <ul className="check-list">
            {previous.map((set) => (
              <li key={set.id}>
                <label className="check-card">
                  <input type="checkbox" checked={selected.includes(set.id)} onChange={() => toggle(set.id)} />
                  <span>
                    <strong>{set.title}</strong> {set.sample && <SampleBadge />}
                    <br />
                    <small>
                      {weekLabel(set.weekStart)} · {wordCount(set.entries.length)}
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            className="btn btn-primary btn-big"
            disabled={selected.length === 0}
            onClick={() => navigate(`/practicar?modo=mezcla&ids=${selected.join(',')}`)}
          >
            {t('startMix')}
          </button>
        </>
      )}
    </div>
  );
}
