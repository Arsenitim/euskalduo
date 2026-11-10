import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminExam, type SetSummary } from './api';

type Form = { id: string | null; title: string; examDate: string; setIds: string[] };
const blank = (): Form => ({ id: null, title: '', examDate: '', setIds: [] });

/**
 * Exams: a selection of sheets and topics with an optional date. Learners
 * get a "Preparar el examen" section (until the date, if there is one); the
 * material stays in ordinary practice as well.
 */
export function ExamsPage() {
  const [exams, setExams] = useState<AdminExam[] | null>(null);
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [form, setForm] = useState<Form>(blank());
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi.listExams().then((r) => setExams(r.exams), (e: unknown) => setError(String(e)));
    adminApi.listSets().then((r) => setSets(r.sets), () => undefined);
  }, []);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      const body = (e as { body?: { errors?: string[] } }).body;
      setError(body?.errors?.join(' ') ?? (e instanceof Error ? e.message : String(e)));
    }
  };
  const save = () =>
    act(async () => {
      const payload = { title: form.title, examDate: form.examDate || null, setIds: form.setIds };
      await (form.id ? adminApi.updateExam(form.id, payload) : adminApi.createExam(payload));
      setForm(blank());
    });
  const title = (id: string) => sets.find((s) => s.id === id)?.title ?? id;

  return (
    <div>
      <h1>Exams</h1>
      <p className="muted">Choose what an exam covers. The date is optional; without one, the exam section stays until you unpublish it.</p>
      {error && <p className="issue issue-error">{error}</p>}
      {exams && exams.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Covers</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td>{exam.title}</td>
                  <td>{exam.examDate ?? <em>none</em>}</td>
                  <td className="small">{exam.setIds.map(title).join(', ')}</td>
                  <td>
                    <span className={`badge badge-${exam.status}`}>{exam.status}</span>
                  </td>
                  <td className="actions">
                    <button className="btn btn-small" onClick={() => setForm({ id: exam.id, title: exam.title, examDate: exam.examDate ?? '', setIds: exam.setIds })}>
                      Edit
                    </button>
                    {exam.status === 'published' ? (
                      <button className="btn btn-small" onClick={() => act(() => adminApi.unpublishExam(exam.id))}>
                        Unpublish
                      </button>
                    ) : (
                      <button className="btn btn-small" onClick={() => act(() => adminApi.publishExam(exam.id))}>
                        Publish
                      </button>
                    )}
                    <button className="btn btn-small btn-danger" onClick={() => window.confirm(`Delete “${exam.title}”?`) && act(() => adminApi.deleteExam(exam.id))}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="card editor-meta"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="wide">{form.id ? 'Edit exam' : 'New exam'}</h2>
        <label>
          Title
          <input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </label>
        <label>
          Date (optional)
          <input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
        </label>
        <fieldset className="wide">
          <legend>Covers</legend>
          {sets.map((s) => (
            <label key={s.id} className="checkbox">
              <input
                type="checkbox"
                checked={form.setIds.includes(s.id)}
                onChange={(e) => setForm({ ...form, setIds: e.target.checked ? [...form.setIds, s.id] : form.setIds.filter((id) => id !== s.id) })}
              />{' '}
              {s.title} <span className="muted">({s.kind}, {s.status})</span>
            </label>
          ))}
        </fieldset>
        <div className="button-row wide">
          <button className="btn btn-primary" type="submit">
            {form.id ? 'Save exam' : 'Create exam (as draft)'}
          </button>
          {form.id && (
            <button className="btn" type="button" onClick={() => setForm(blank())}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
