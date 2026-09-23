import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminApi, issuesOf, type AdminSet, type Issue } from './api';
import { draftFromModel, IssueList, modelFromDraft, SetEditor, type EditorModel } from './SetEditor';

export function SetPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [set, setSet] = useState<AdminSet | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [model, setModel] = useState<EditorModel | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(
    () =>
      adminApi
        .getSet(id)
        .then((r) => {
          setSet(r.set);
          setBlockers(r.publishBlockers);
          setModel(modelFromDraft(r.set));
          setDirty(false);
        })
        .catch((e: unknown) => setErrors(issuesOf(e).errors)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      setErrors([]);
      await load();
      setMessage(done);
    } catch (e) {
      const issues = issuesOf(e);
      setErrors(issues.errors);
      setWarnings(issues.warnings);
    } finally {
      setBusy(false);
    }
  };

  if (!set || !model) {
    return errors.length ? <IssueList errors={errors} warnings={[]} /> : <p>Loading…</p>;
  }

  const save = () =>
    run(async () => {
      const r = await adminApi.updateSet(set.id, draftFromModel(model));
      setWarnings(r.warnings);
    }, 'Saved.');

  return (
    <div>
      <div className="title-row">
        <h1>
          {set.title} <span className={`badge badge-${set.status}`}>{set.status}</span> {set.sample && <span className="badge badge-sample">sample</span>}
        </h1>
      </div>
      <div className="button-row sticky-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
          {dirty ? 'Save changes' : 'Saved'}
        </button>
        {set.status === 'draft' ? (
          <button className="btn" onClick={() => run(() => adminApi.publish(set.id), 'Published — learners can see it now.')} disabled={busy || dirty || blockers.length > 0} title={dirty ? 'Save first' : blockers.join(' ')}>
            Publish
          </button>
        ) : (
          <button className="btn" onClick={() => window.confirm('Unpublish? Learners will no longer see this set.') && run(() => adminApi.unpublish(set.id), 'Unpublished.')} disabled={busy}>
            Unpublish
          </button>
        )}
        <button className="btn" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
          {preview ? 'Back to editing' : 'Preview'}
        </button>
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Delete “${set.title}” and its pictures permanently? This cannot be undone.`)) return;
            await run(() => adminApi.deleteSet(set.id), 'Deleted.').then(() => navigate('/'));
          }}
        >
          Delete
        </button>
        <span role="status" className="status-line">
          {message}
        </span>
      </div>
      {set.status === 'draft' && blockers.length > 0 && !dirty && (
        <ul className="issues">
          {blockers.map((b) => (
            <li key={b} className="issue issue-warning">
              <strong>Before publishing</strong> {b}
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        <Preview model={model} />
      ) : (
        <SetEditor
          model={model}
          onChange={(m) => {
            setModel(m);
            setDirty(true);
          }}
          errors={errors}
          warnings={warnings}
          setId={set.id}
          onImageChanged={(entryId, image) => setModel((m) => m && { ...m, rows: m.rows.map((r) => (r.id === entryId ? { ...r, image } : r)) })}
        />
      )}
    </div>
  );
}

function Preview({ model }: { model: EditorModel }) {
  return (
    <div className="card">
      <p className="muted">How learners will see the word list (Spanish).</p>
      <h2>{model.title}</h2>
      {model.description && <p>{model.description}</p>}
      <ul className="word-grid">
        {model.rows.map((r) => (
          <li key={r.uid} className="word-card">
            {r.image ? <img className="word-visual word-visual-small" src={r.image} alt="" /> : r.emoji ? <span className="word-visual word-emoji word-visual-small">{r.emoji}</span> : null}
            <span className="word-basque" lang="eu">
              {r.basque}
            </span>
            <span className="word-meaning">{r.es.split(';').map((s) => s.trim()).filter(Boolean).join(' / ')}</span>
            {r.group && <span className="word-note">{model.groups.find((g) => g.key === r.group)?.title}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
