import { t } from '../../i18n';
import type { HomeworkSet } from '../../types';
import { ProgressBar } from '../components/bits';
import { useLearner } from '../LearnerContext';
import { entryKey, type LearnerState } from '../progress';
import { LEARNED_BOX } from '../scheduler';
import { setProgress } from '../setProgress';
import { CollectionList } from './TopicsPage';

/** A skill counts as known after two right answers in a row for it. */
const KNOWN_STREAK = 2;

export function skillSummary(sets: HomeworkSet[], state: LearnerState) {
  const out = { words: 0, recognition: 0, spelling: 0, sentences: 0, sentencesLearned: 0, grammar: 0, grammarLearned: 0 };
  const seen = new Set<string>();
  for (const set of sets) {
    for (const entry of set.entries) {
      const key = entryKey(set.id, entry.id);
      const learned = (state.entries[key]?.box ?? 0) >= LEARNED_BOX;
      if (entry.type === 'sentence') {
        out.sentences++;
        if (learned) out.sentencesLearned++;
      } else if (entry.type === 'grammar') {
        out.grammar++;
        if (learned) out.grammarLearned++;
      } else {
        // The same spelling in two sheets counts once here.
        const basque = entry.basque.toLocaleLowerCase('es');
        if (seen.has(basque)) continue;
        seen.add(basque);
        out.words++;
        if ((state.skills[key]?.recognition?.streak ?? 0) >= KNOWN_STREAK) out.recognition++;
        if ((state.skills[key]?.spelling?.streak ?? 0) >= KNOWN_STREAK) out.spelling++;
      }
    }
  }
  return out;
}

export function ProgressPage() {
  const { sets, topics, sheets, stories, state } = useLearner();
  const all = sets ?? [];
  const rows = all.map((set) => setProgress(set, state));
  const learned = rows.reduce((n, p) => n + p.learned, 0);
  const total = rows.reduce((n, p) => n + p.total, 0);
  const skills = skillSummary(all, state);
  const understood = stories.filter((s) => (state.stories[s.id]?.passes ?? 0) > 0).length;

  return (
    <div>
      <h1>{t('progressTitle')}</h1>
      <div className="card">
        <h2>{t('progressOverall')}</h2>
        <ProgressBar value={learned} max={total} label={t('learned', { n: learned, total })} />
        <p className="muted">{t('progressLocal')}</p>
      </div>
      <div className="card">
        <h2>{t('progressSkills')}</h2>
        <SkillRow label={t('skillRecognition')} value={skills.recognition} max={skills.words} note={t('skillRecognitionNote')} />
        <SkillRow label={t('skillSpelling')} value={skills.spelling} max={skills.words} note={t('skillSpellingNote')} />
        {skills.sentences > 0 && <SkillRow label={t('skillSentences')} value={skills.sentencesLearned} max={skills.sentences} />}
        {skills.grammar > 0 && <SkillRow label={t('skillGrammar')} value={skills.grammarLearned} max={skills.grammar} />}
        {stories.length > 0 && <SkillRow label={t('skillListening')} value={understood} max={stories.length} note={t('skillListeningNote')} />}
      </div>
      <h2>{t('progressTopics')}</h2>
      <CollectionList sets={[...topics, ...sheets]} />
    </div>
  );
}

function SkillRow({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  return (
    <div className="skill-row">
      <h3>{label}</h3>
      <ProgressBar value={value} max={max} label={t('skillCount', { n: value, total: max })} />
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}
