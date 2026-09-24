import { useState } from 'react';
import type { Group, SetKind } from '../types';
import { adminApi, type AdminEntry, type Draft, type Issue } from './api';

export interface Row {
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
  weekStart: string;
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

export function modelFromDraft(draft: Draft): EditorModel {
  return {
    kind: draft.kind,
    title: draft.title,
    weekStart: draft.weekStart ?? '',
    description: draft.description ?? '',
    groups: draft.groups,
    rows: draft.entries.map((e) => ({
      uid: uid(),
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
    weekStart: model.kind === 'week' ? model.weekStart || null : null,
    description: nullIfEmpty(model.description),
    groups: model.groups,
    entries: model.rows.map((r): AdminEntry => {
      const ru = splitAlternatives(r.ru);
      return {
        id: r.id,
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
  return { uid: uid(), id: null, basque: '', es: '', ru: '', note: '', group: '', emoji: '', imageHint: '', needsReview: false, reviewNote: '', image: null };
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
            <option value="week">Homework week</option>
            <option value="topic">Category (no week: months, animals…)</option>
          </select>
        </label>
        {model.kind === 'week' && (
          <label>
            Homework week (Monday)
            <input type="date" value={model.weekStart} onChange={(e) => setField('weekStart', e.target.value)} />
          </label>
        )}
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
                  Basque
                  <input lang="eu" value={row.basque} maxLength={80} onChange={(e) => setRow(index, { basque: e.target.value })} />
                </label>
                <label>
                  Spanish
                  <input lang="es" value={row.es} onChange={(e) => setRow(index, { es: e.target.value })} />
                </label>
                <label>
                  Russian (optional)
                  <input lang="ru" value={row.ru} onChange={(e) => setRow(index, { ru: e.target.value })} />
                </label>
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
