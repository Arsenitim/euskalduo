import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StoryBlock } from '../learner/components/StoryBlock';
import type { Lang, Localized, StoryQuestion } from '../types';
import { adminApi, issuesOf, type AdminStory, type Issue, type SetSummary, type StoryDraft } from './api';
import { IssueList } from './SetEditor';

const seconds = (ms: number | null) => (ms === null ? '—' : `${Math.round(ms / 1000)} s`);

function AudioState({ story }: { story: AdminStory }) {
  const { audio } = story;
  if (audio.state === 'ready') return <span className="badge badge-published">audio {seconds(audio.durationMs)}</span>;
  if (audio.state === 'failed') return <span className="badge badge-review" title={audio.failure ?? ''}>audio failed</span>;
  return <span className="badge badge-draft">audio pending</span>;
}

/** Stories: their review, audio and publication state at a glance. */
export function StoryListPage() {
  const [stories, setStories] = useState<AdminStory[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    adminApi.listStories().then((r) => setStories(r.stories), (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <h1>Listening stories</h1>
      <p className="muted">
        A story can be published once it is reviewed and the speech worker has generated audio for its exact text with a suitable length
        (short: 15–50 s, target 20–40 s; extended: 40–130 s, target 60–90 s). Import a story JSON under <Link to="/import">Import</Link>.
      </p>
      {error && <p className="issue issue-error">{error}</p>}
      {!stories ? (
        <p>Loading…</p>
      ) : stories.length === 0 ? (
        <p className="card">No stories yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Format</th>
                <th>Level</th>
                <th>Status</th>
                <th>Audio</th>
                <th>Blockers</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/stories/${s.id}`}>{s.title}</Link> {s.needsReview && <span className="badge badge-review">needs review</span>}
                  </td>
                  <td>{s.format}</td>
                  <td>{s.difficulty}</td>
                  <td>
                    <span className={`badge badge-${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    <AudioState story={s} />
                  </td>
                  <td className="small">{s.publishBlockers.length === 0 ? 'ready to publish' : s.publishBlockers.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const emptyLocalized = (): Localized => ({ es: '', ru: '' });
const list = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function draftOf(story: AdminStory): StoryDraft {
  const { id, title, format, difficulty, transcript, translations, questions, links, needsReview, reviewNote } = story;
  return { id, title, format, difficulty, transcript, translations, questions, links, needsReview, reviewNote };
}

/** Edit one story: text, translations, questions, links; see audio and publish. */
export function StoryPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState<AdminStory | null>(null);
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [errors, setErrors] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewLang, setPreviewLang] = useState<Lang>('es');
  const [preview, setPreview] = useState(0);

  const load = useCallback(() => {
    adminApi.getStory(id).then(
      ({ story }) => {
        setStory(story);
        setDraft(draftOf(story));
      },
      (e: unknown) => setErrors(issuesOf(e).errors),
    );
    adminApi.listSets().then((r) => setSets(r.sets), () => undefined);
  }, [id]);
  useEffect(load, [load]);

  if (!story || !draft) return <p>{errors.length ? <IssueList errors={errors} warnings={[]} /> : 'Loading…'}</p>;

  const set = <K extends keyof StoryDraft>(key: K, value: StoryDraft[K]) => setDraft({ ...draft, [key]: value });
  const setQuestion = (i: number, q: StoryQuestion) => set('questions', draft.questions.map((x, j) => (j === i ? q : x)));
  const act = async (fn: () => Promise<{ story: AdminStory; warnings?: Issue[] }>, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await fn();
      setStory(result.story);
      setDraft(draftOf(result.story));
      setErrors([]);
      setWarnings(result.warnings ?? []);
      setMessage(done);
    } catch (e) {
      const issues = issuesOf(e);
      setErrors(issues.errors);
      setWarnings(issues.warnings);
    } finally {
      setBusy(false);
    }
  };
  const textChanged = draft.transcript !== story.transcript;

  return (
    <div className="editor">
      <p>
        <Link to="/stories">← Stories</Link>
      </p>
      <h1>
        {story.title} <span className={`badge badge-${story.status}`}>{story.status}</span> <AudioState story={story} />
      </h1>
      {story.sample && <p className="muted">Starter story shipped with the app.</p>}
      {story.publishBlockers.length > 0 && (
        <ul className="issues">
          {story.publishBlockers.map((b) => (
            <li key={b} className="issue issue-error">
              <strong>Before publishing</strong> {b}
            </li>
          ))}
        </ul>
      )}
      {story.publishWarnings.map((w) => (
        <p key={w} className="issue issue-warning">
          <strong>Check</strong> {w}
        </p>
      ))}
      {story.audio.failure && <p className="issue issue-error">Last audio error: {story.audio.failure}</p>}
      {story.audio.url && (
        <p>
          <audio controls preload="none" src={story.audio.url}>
            <track kind="captions" />
          </audio>
        </p>
      )}
      <IssueList errors={errors} warnings={warnings} />
      {message && <p className="issue issue-ok">{message}</p>}

      <div className="editor-meta">
        <label>
          Title
          <input value={draft.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label>
          Format
          <select value={draft.format} onChange={(e) => set('format', e.target.value as StoryDraft['format'])}>
            <option value="short">Short (in lessons, 1–2 questions)</option>
            <option value="extended">Extended (listening section, 3–5 questions)</option>
          </select>
        </label>
        <label>
          Difficulty
          <select value={draft.difficulty} onChange={(e) => set('difficulty', Number(e.target.value))}>
            <option value={1}>1 easy</option>
            <option value={2}>2 medium</option>
            <option value={3}>3 harder</option>
          </select>
        </label>
        <label className="wide">
          Basque text (spoken by the voice; editing it needs new audio before the story can be published again)
          <textarea lang="eu" rows={6} value={draft.transcript} onChange={(e) => set('transcript', e.target.value)} />
        </label>
        {textChanged && <p className="issue issue-warning wide">The text changed: saving it takes a published story offline until its new audio is ready.</p>}
        <label className="wide">
          Spanish translation
          <textarea lang="es" rows={4} value={draft.translations.es} onChange={(e) => set('translations', { ...draft.translations, es: e.target.value })} />
        </label>
        <label className="wide">
          Russian translation
          <textarea lang="ru" rows={4} value={draft.translations.ru} onChange={(e) => set('translations', { ...draft.translations, ru: e.target.value })} />
        </label>
      </div>

      <h2>Questions</h2>
      <ol className="entry-rows">
        {draft.questions.map((q, i) => (
          <li key={i} className="entry-row">
            <div className="entry-fields">
              <label className="wide">
                Question (Spanish)
                <input lang="es" value={q.prompt.es} onChange={(e) => setQuestion(i, { ...q, prompt: { ...q.prompt, es: e.target.value } })} />
              </label>
              <label className="wide">
                Question (Russian)
                <input lang="ru" value={q.prompt.ru} onChange={(e) => setQuestion(i, { ...q, prompt: { ...q.prompt, ru: e.target.value } })} />
              </label>
              {q.options.map((o, j) => (
                <fieldset key={j} className="wide option-edit">
                  <legend>
                    <label className="checkbox">
                      <input type="radio" name={`correct-${i}`} checked={q.correct === j} onChange={() => setQuestion(i, { ...q, correct: j })} /> Option {j + 1} is right
                    </label>
                  </legend>
                  <input lang="es" aria-label={`Option ${j + 1} Spanish`} value={o.es} onChange={(e) => setQuestion(i, { ...q, options: q.options.map((x, k) => (k === j ? { ...x, es: e.target.value } : x)) })} />
                  <input lang="ru" aria-label={`Option ${j + 1} Russian`} value={o.ru} onChange={(e) => setQuestion(i, { ...q, options: q.options.map((x, k) => (k === j ? { ...x, ru: e.target.value } : x)) })} />
                </fieldset>
              ))}
              <div className="button-row">
                {q.options.length < 4 && (
                  <button type="button" className="btn btn-small" onClick={() => setQuestion(i, { ...q, options: [...q.options, emptyLocalized()] })}>
                    + Option
                  </button>
                )}
                {q.options.length > 2 && (
                  <button type="button" className="btn btn-small" onClick={() => setQuestion(i, { ...q, options: q.options.slice(0, -1), correct: Math.min(q.correct, q.options.length - 2) })}>
                    − Last option
                  </button>
                )}
              </div>
            </div>
            <div className="entry-actions">
              <button type="button" className="btn btn-small btn-danger" onClick={() => set('questions', draft.questions.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}>
                ✕
              </button>
            </div>
          </li>
        ))}
      </ol>
      {draft.questions.length < 5 && (
        <button
          type="button"
          className="btn"
          onClick={() => set('questions', [...draft.questions, { id: `q${Date.now().toString(36)}`, prompt: emptyLocalized(), options: [emptyLocalized(), emptyLocalized()], correct: 0 }])}
        >
          + Add question
        </button>
      )}

      <h2>Links</h2>
      <div className="editor-meta">
        <label className="wide">
          Basque words the story uses (comma-separated, exact spelling as in the catalogue)
          <input lang="eu" value={draft.links.words.join(', ')} onChange={(e) => set('links', { ...draft.links, words: list(e.target.value) })} />
        </label>
        <label className="wide">
          Topics / constructions (comma-separated tags, e.g. eskola, izan)
          <input value={draft.links.topics.join(', ')} onChange={(e) => set('links', { ...draft.links, topics: list(e.target.value) })} />
        </label>
        <label className="wide">
          Related sheets and topics
          <select
            multiple
            value={draft.links.sets}
            onChange={(e) => set('links', { ...draft.links, sets: Array.from(e.target.selectedOptions, (o) => o.value) })}
            size={Math.min(8, Math.max(3, sets.length))}
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={draft.needsReview} onChange={(e) => set('needsReview', e.target.checked)} /> Needs review (by a Basque speaker)
        </label>
        <label className="wide">
          Review note
          <input value={draft.reviewNote ?? ''} onChange={(e) => set('reviewNote', e.target.value || null)} />
        </label>
      </div>

      <div className="button-row sticky-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => act(() => adminApi.updateStory(story.id, draft), 'Saved.')}>
          Save
        </button>
        {story.status === 'published' ? (
          <button className="btn" disabled={busy} onClick={() => act(() => adminApi.unpublishStory(story.id), 'Unpublished.')}>
            Unpublish
          </button>
        ) : (
          <button className="btn" disabled={busy || story.publishBlockers.length > 0} onClick={() => act(() => adminApi.publishStory(story.id), 'Published.')}>
            Publish
          </button>
        )}
        <button className="btn" disabled={busy} onClick={load}>
          Refresh audio status
        </button>
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Delete “${story.title}” permanently?`)) return;
            await adminApi.deleteStory(story.id);
            navigate('/stories');
          }}
        >
          Delete
        </button>
      </div>

      {story.audio.url && (
        <section className="preview">
          <h2>Preview (as learners see it)</h2>
          <label>
            Meaning language{' '}
            <select value={previewLang} onChange={(e) => setPreviewLang(e.target.value as Lang)}>
              <option value="es">Spanish</option>
              <option value="ru">Russian</option>
            </select>
          </label>{' '}
          <button className="btn btn-small" onClick={() => setPreview((n) => n + 1)}>
            Restart preview
          </button>
          <div className="card question-card" key={`${preview}-${previewLang}`}>
            <StoryBlock
              story={{ ...story, audio: story.audio.url, durationMs: story.audio.durationMs }}
              optionOrder={story.questions.map((q) => q.options.map((_, i) => i))}
              lang={previewLang}
              sound
              onDone={() => setPreview((n) => n + 1)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
