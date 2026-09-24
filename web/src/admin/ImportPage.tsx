import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import hiztegiaSample from '../../../samples/hiztegia-1-gaia.json?raw';
import calendarSample from '../../../samples/hilabeteak-eta-astegunak.json?raw';
import { adminApi, issuesOf, type Issue } from './api';
import { draftFromModel, IssueList, modelFromDraft, SetEditor, type EditorModel } from './SetEditor';

type Format = 'json' | 'lines';

const LINES_EXAMPLE = `Zaborrontzia — cubo de la basura
Txapelketa — campeonato; concurso
Bizkar-zorroa — mochila`;

export function ImportPage() {
  const navigate = useNavigate();
  const [format, setFormat] = useState<Format>('json');
  const [text, setText] = useState('');
  const [model, setModel] = useState<EditorModel | null>(null);
  const [errors, setErrors] = useState<Issue[]>([]);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      const result = await adminApi.validate(format, text);
      setErrors(result.errors);
      setWarnings(result.warnings);
      setModel(result.draft ? modelFromDraft(result.draft) : null);
    } catch (e) {
      setErrors(issuesOf(e).errors);
      setModel(null);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!model) return;
    setBusy(true);
    try {
      const { set } = await adminApi.createSet(draftFromModel(model));
      navigate(`/sets/${set.id}`);
    } catch (e) {
      const issues = issuesOf(e);
      setErrors(issues.errors);
      setWarnings(issues.warnings);
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      setErrors([{ path: '', entry: null, message: 'The file is larger than 1 MB.' }]);
      return;
    }
    setFormat('json');
    setText(await file.text());
    setModel(null);
  };

  return (
    <div>
      <h1>Import homework</h1>
      <p className="muted">
        Prepare the JSON with ChatGPT using the prompt in <code>CHATGPT_IMPORT_INSTRUCTIONS.md</code>, then paste or upload it here. Nothing is saved until
        you review it and press “Save as draft”. Drafts are invisible to learners until published.
      </p>
      <div className="card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={format === 'json'} className={format === 'json' ? 'tab is-active' : 'tab'} onClick={() => setFormat('json')}>
            JSON (recommended)
          </button>
          <button role="tab" aria-selected={format === 'lines'} className={format === 'lines' ? 'tab is-active' : 'tab'} onClick={() => setFormat('lines')}>
            Quick lines “Basque — Spanish”
          </button>
        </div>
        <label className="visually-hidden" htmlFor="import-text">
          Import content
        </label>
        <textarea
          id="import-text"
          className="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={format === 'json' ? '{ "schemaVersion": 1, "title": "…", "entries": [ … ] }' : LINES_EXAMPLE}
          spellCheck={false}
          rows={12}
        />
        <div className="button-row">
          {format === 'json' && (
            <label className="btn">
              Upload .json file
              <input type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
          )}
          {format === 'json' && (
            <>
              <button className="btn btn-small" onClick={() => setText(hiztegiaSample)}>
                Load example: HIZTEGIA (1.Gaia)
              </button>
              <button className="btn btn-small" onClick={() => setText(calendarSample)}>
                Load example: HILABETEAK ETA ASTEGUNAK
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={check} disabled={busy || text.trim() === ''}>
            Check &amp; review
          </button>
        </div>
      </div>

      {!model && <IssueList errors={errors} warnings={warnings} />}

      {model && (
        <section className="card">
          <h2>Review before saving</h2>
          <p className="muted">
            {model.rows.length} entries. Fix any errors, assign the homework week (or make it a category), and clear “needs review” flags before publishing.
          </p>
          <SetEditor model={model} onChange={setModel} errors={errors} warnings={warnings} />
          <div className="button-row sticky-actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              Save as draft
            </button>
            <button className="btn" onClick={() => window.confirm('Discard this review?') && setModel(null)}>
              Discard
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
