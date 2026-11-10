import { useState } from 'react';
import type { EntryType, Formation, Group, SetKind } from '../types';
import { adminApi, type AdminEntry, type Draft, type Issue } from './api';

export interface Row {
  type: EntryType;
  /** Sentence: tiles in order, separated by " | "; one alternative order per line; extra tiles. */
  tiles: string;
  alternatives: string;
  extraTiles: string;
  /** Grammar: the text with ___, accepted answers and wrong options (";"-separated). */
  gapText: string;
  answers: string;
  wrongOptions: string;
  formation: Formation | null;
  uid: string;
  id: string | null;
  basque: string;
  es: string;
  ru: string;
  note: string;
  group: string;
  emoji: string;
  imageHint: string;
  needsReview: boolean;
  reviewNote: string;
  image: string | null;
}

export interface EditorModel {
  kind: SetKind;
  title: string;
  receivedOn: string;
  description: string;
  groups: Group[];
  rows: Row[];
}

let uidCounter = 0;
const uid = () => `r${++uidCounter}`;

/** Alternatives are entered separated by ";" — commas stay inside one answer. */
const splitAlternatives = (text: string) =>
  text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

const nullIfEmpty = (s: string) => (s.trim() === '' ? null : s.trim());
const TILE_SEPARATOR = ' | ';
const splitTiles = (text: string) =>
  text
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

export function modelFromDraft(draft: Draft): EditorModel {
  return {
    kind: draft.kind,
    title: draft.title,
    receivedOn: draft.receivedOn ?? '',
    description: draft.description ?? '',
    groups: draft.groups,
    rows: draft.entries.map((e) => ({
      uid: uid(),
      type: e.type ?? 'word',
      tiles: (e.sentence?.tiles ?? []).join(TILE_SEPARATOR),
      alternatives: (e.sentence?.alternatives ?? []).map((a) => a.join(TILE_SEPARATOR)).join('\n'),
      extraTiles: (e.sentence?.distractors ?? []).join(TILE_SEPARATOR),
      gapText: e.grammar?.text ?? '',
      answers: (e.grammar?.answers ?? []).join('; '),
      wrongOptions: (e.grammar?.distractors ?? []).join('; '),
      formation: e.formation ?? null,
      id: e.id,
      basque: e.basque,
      es: e.translations.es.join('; '),
      ru: (e.translations.ru ?? []).join('; '),
      note: e.note ?? '',
      group: e.group ?? '',
      emoji: e.emoji ?? '',
      imageHint: e.imageHint ?? '',
      needsReview: e.needsReview,
      reviewNote: e.reviewNote ?? '',
      image: e.image ?? null,
    })),
  };
}

export function draftFromModel(model: EditorModel): Draft {
  return {
    kind: model.kind,
    title: model.title,
    receivedOn: model.kind === 'sheet' ? model.receivedOn || null : null,
    description: nullIfEmpty(model.description),
    groups: model.groups,
    entries: model.rows.map((r): AdminEntry => {
      const ru = splitAlternatives(r.ru);
      return {
        id: r.id,
        type: r.type,
        sentence: r.type === 'sentence' ? { tiles: splitTiles(r.tiles), alternatives: r.alternatives.split('\n').map(splitTiles).filter((a) => a.length > 0), distractors: splitTiles(r.extraTiles) } : null,
        grammar: r.type === 'grammar' ? { text: r.gapText.trim(), answers: splitAlternatives(r.answers), distractors: splitAlternatives(r.wrongOptions) } : null,
        formation: r.type === 'word' ? r.formation : null,
        basque: r.basque,
        translations: ru.length > 0 ? { es: splitAlternatives(r.es), ru } : { es: splitAlternatives(r.es) },
        note: nullIfEmpty(r.note),
        group: r.group || null,
        emoji: nullIfEmpty(r.emoji),
        imageHint: nullIfEmpty(r.imageHint),
        needsReview: r.needsReview,
        reviewNote: nullIfEmpty(r.reviewNote),
      };
    }),
  };
}

function emptyRow(): Row {
  return { type: 'word', tiles: '', alternatives: '', extraTiles: '', gapText: '', answers: '', wrongOptions: '', formation: null, uid: uid(), id: null, basque: '', es: '', ru: '', note: '', group: '', emoji: '', imageHint: '', needsReview: false, reviewNote: '', image: null };
}

interface Props {
  model: EditorModel;
  onChange: (model: EditorModel) => void;
  errors: Issue[];
  warnings: Issue[];
  /** Saved set id: enables image upload for saved entries. */
  setId?: string;
  onImageChanged?: (entryId: string, image: string | null) => void;
}

export function SetEditor({ model, onChange, errors, warnings, setId, onImageChanged }: Props) {
  const setField = <K extends keyof EditorModel>(key: K, value: EditorModel[K]) => onChange({ ...model, [key]: value });
  const setRow = (index: number, patch: Partial<Row>) => setField('rows', model.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const moveRow = (index: number, delta: number) => {
    const rows = [...model.rows];
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target]!, rows[index]!];
    setField('rows', rows);
  };
  const removeRow = (index: number) => {
    const row = model.rows[index]!;
    if (window.confirm(`Remove “${row.basque || 'this entry'}”? Learners lose local progress for it once saved.`)) {
      setField('rows', model.rows.filter((_, i) => i !== index));
    }
  };

  const general = [...errors.filter((e) => e.entry === null)];
  const generalWarnings = warnings.filter((w) => w.entry === null);

  return (
    <div className="editor">
      <IssueList errors={general} warnings={generalWarnings} />
      <div className="editor-meta">
        <label>
          Title
          <input value={model.title} maxLength={120} onChange={(e) => setField('title', e.target.value)} required />
        </label>
        <label>
          Type
          <select value={model.kind} onChange={(e) => setField('kind', e.target.value as SetKind)}>
            <option value="sheet">School sheet</option>
            <option value="topic">Topic (months, sentences, animals…)</option>
          </select>
        </label>
        {model.kind === 'sheet' && (
          <label>
            Received on (optional, for reference only — never affects practice)
            <input type="date" value={model.receivedOn} onChange={(e) => setField('receivedOn', e.target.value)} />
          </label>
        )}
        <p className="muted wide">Exams are set up under <a href="#/exams">Exams</a>.</p>
        <label className="wide">
          Description / theme (optional)
          <input value={model.description} maxLength={500} onChange={(e) => setField('description', e.target.value)} />
        </label>
      </div>

      <GroupsEditor groups={model.groups} onChange={(groups) => setField('groups', groups)} />

      <p className="muted">
        Separate alternative translations with <kbd>;</kbd> (for example <code>campeonato; concurso</code>). Each alternative is accepted on its own.
      </p>
      <ol className="entry-rows">
        {model.rows.map((row, index) => {
          const rowErrors = errors.filter((e) => e.entry === index);
          const rowWarnings = warnings.filter((w) => w.entry === index);
          return (
            <li key={row.uid} className={`entry-row ${rowErrors.length ? 'has-error' : ''} ${row.needsReview ? 'needs-review' : ''}`}>
              <div className="entry-num">{index + 1}</div>
              <div className="entry-fields">
                <label>
                  Kind
                  <select value={row.type} onChange={(e) => setRow(index, { type: e.target.value as EntryType })}>
                    <option value="word">Word</option>
                    <option value="sentence">Sentence building</option>
                    <option value="grammar">Grammar (fill the gap)</option>
                  </select>
                </label>
                <label>
                  {row.type === 'word' ? 'Basque' : 'Basque sentence (complete)'}
                  <input lang="eu" value={row.basque} maxLength={row.type === 'word' ? 80 : 160} onChange={(e) => setRow(index, { basque: e.target.value })} />
                </label>
                {row.type === 'sentence' && (
                  <>
                    <label className="wide">
                      Tiles in the right order, separated by | (repeats allowed; punctuation may be its own tile)
                      <input lang="eu" value={row.tiles} onChange={(e) => setRow(index, { tiles: e.target.value })} placeholder="gaur | astelehena | da | ." />
                    </label>
                    <label className="wide">
                      Other accepted orders (one per line, same tiles)
                      <textarea lang="eu" rows={2} value={row.alternatives} onChange={(e) => setRow(index, { alternatives: e.target.value })} placeholder="astelehena | da | gaur | ." />
                    </label>
                    <label className="wide">
                      Extra tiles that do not belong (optional, separated by |; must not make another valid sentence)
                      <input lang="eu" value={row.extraTiles} onChange={(e) => setRow(index, { extraTiles: e.target.value })} />
                    </label>
                  </>
                )}
                {row.type === 'grammar' && (
                  <>
                    <label className="wide">
                      Sentence with one gap written as ___
                      <input lang="eu" value={row.gapText} onChange={(e) => setRow(index, { gapText: e.target.value })} placeholder="Ni ikaslea ___." />
                    </label>
                    <label>
                      Accepted answers (;)
                      <input lang="eu" value={row.answers} onChange={(e) => setRow(index, { answers: e.target.value })} />
                    </label>
                    <label>
                      Wrong options (;)
                      <input lang="eu" value={row.wrongOptions} onChange={(e) => setRow(index, { wrongOptions: e.target.value })} />
                    </label>
                  </>
                )}
                <label>
                  Spanish
                  <input lang="es" value={row.es} onChange={(e) => setRow(index, { es: e.target.value })} />
                </label>
                <label>
                  Russian (optional)
                  <input lang="ru" value={row.ru} onChange={(e) => setRow(index, { ru: e.target.value })} />
                </label>
                {row.type === 'word' && <label>
                  Word formation
                  <select value={row.formation?.kind ?? ''} onChange={(e) => setRow(index, { formation: e.target.value ? { kind: e.target.value as Formation['kind'], parts: row.formation?.parts ?? ['', ''] } : null })}>
                    <option value="">None</option>
                    <option value="compound">Compound: two words</option>
                    <option value="derived">Derived: stem + suffix</option>
                  </select>
                </label>}
                {row.type === 'word' && row.formation && row.formation.parts.map((part, n) => (
                  <label key={n}>
                    {n === 0 ? 'First word / stem' : 'Second word / suffix (e.g. -lari)'}
                    <input lang="eu" value={part} maxLength={40} onChange={(e) => {
                      const parts: [string, string] = [...row.formation!.parts];
                      parts[n] = e.target.value;
                      setRow(index, { formation: { ...row.formation!, parts } });
                    }} />
                  </label>
                ))}
                <label>
                  Note (optional)
                  <input value={row.note} maxLength={300} onChange={(e) => setRow(index, { note: e.target.value })} />
                </label>
                {model.groups.length > 0 && (
                  <label>
                    Group
                    <select value={row.group} onChange={(e) => setRow(index, { group: e.target.value })}>
                      <option value="">—</option>
                      {model.groups.map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="narrow">
                  Emoji
                  <input value={row.emoji} maxLength={8} onChange={(e) => setRow(index, { emoji: e.target.value })} />
                </label>
                <label>
                  Image hint (editorial)
                  <input value={row.imageHint} maxLength={200} onChange={(e) => setRow(index, { imageHint: e.target.value })} />
                </label>
                <label className="checkbox">
                  <input type="checkbox" checked={row.needsReview} onChange={(e) => setRow(index, { needsReview: e.target.checked })} /> Needs review
                </label>
                {row.needsReview && (
                  <label className="wide">
                    Review note
                    <input value={row.reviewNote} maxLength={300} onChange={(e) => setRow(index, { reviewNote: e.target.value })} />
                  </label>
                )}
                <ImageCell setId={setId} row={row} onImageChanged={(image) => row.id && onImageChanged?.(row.id, image)} />
                <IssueList errors={rowErrors} warnings={rowWarnings} />
              </div>
              <div className="entry-actions">
                <button type="button" className="btn btn-small" onClick={() => moveRow(index, -1)} disabled={index === 0} aria-label={`Move entry ${index + 1} up`}>
                  ↑
                </button>
                <button type="button" className="btn btn-small" onClick={() => moveRow(index, 1)} disabled={index === model.rows.length - 1} aria-label={`Move entry ${index + 1} down`}>
                  ↓
                </button>
                <button type="button" className="btn btn-small btn-danger" onClick={() => removeRow(index)} aria-label={`Remove entry ${index + 1}`}>
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn" onClick={() => setField('rows', [...model.rows, emptyRow()])}>
        + Add entry
      </button>
    </div>
  );
}

function ImageCell({ setId, row, onImageChanged }: { setId?: string; row: Row; onImageChanged: (image: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!setId) return null;
  if (!row.id) return <p className="muted wide">Save the set to add a picture to this new entry.</p>;
  const entryId = row.id;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPEG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The image is larger than 5 MB.');
      return;
    }
    setBusy(true);
    try {
      onImageChanged((await adminApi.uploadImage(setId, entryId, file)).image);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove this picture?')) return;
    setBusy(true);
    try {
      await adminApi.deleteImage(setId, entryId);
      onImageChanged(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="image-cell wide">
      {row.image ? <img src={row.image} alt={`Picture for ${row.basque}`} /> : <span className="muted">No picture</span>}
      <label className="btn btn-small">
        {row.image ? 'Replace picture' : 'Upload picture'}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {row.image && (
        <button type="button" className="btn btn-small" onClick={remove} disabled={busy}>
          Remove picture
        </button>
      )}
      {busy && <span className="muted">Working…</span>}
      {error && (
        <span className="issue issue-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function GroupsEditor({ groups, onChange }: { groups: Group[]; onChange: (groups: Group[]) => void }) {
  const set = (i: number, patch: Partial<Group>) => onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  return (
    <details className="groups-editor" open={groups.length > 0}>
      <summary>Groups ({groups.length}) — optional sections such as months or weekdays</summary>
      {groups.map((g, i) => (
        <div key={i} className="group-row">
          <label>
            Key
            <input value={g.key} onChange={(e) => set(i, { key: e.target.value })} />
          </label>
          <label>
            Title
            <input value={g.title} onChange={(e) => set(i, { title: e.target.value })} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={g.ordered} onChange={(e) => set(i, { ordered: e.target.checked })} /> Has a meaningful order
          </label>
          <button type="button" className="btn btn-small btn-danger" onClick={() => onChange(groups.filter((_, j) => j !== i))}>
            Remove group
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-small" onClick={() => onChange([...groups, { key: `group-${groups.length + 1}`, title: '', ordered: false }])}>
        + Add group
      </button>
    </details>
  );
}

export function IssueList({ errors, warnings }: { errors: Issue[]; warnings: Issue[] }) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <ul className="issues wide">
      {errors.map((e, i) => (
        <li key={`e${i}`} className="issue issue-error">
          <strong>Error</strong> {e.path && <code>{e.path}</code>} {e.message}
        </li>
      ))}
      {warnings.map((w, i) => (
        <li key={`w${i}`} className="issue issue-warning">
          <strong>Check</strong> {w.path && <code>{w.path}</code>} {w.message}
        </li>
      ))}
    </ul>
  );
}
