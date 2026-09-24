import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, type SetSummary } from './api';

export function SetListPage() {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .listSets()
      .then((r) => setSets(r.sets))
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    load();
  };

  return (
    <div>
      <div className="title-row">
        <h1>Homework sets</h1>
        <Link className="btn btn-primary" to="/import">
          + Import homework
        </Link>
      </div>
      {error && (
        <p className="issue issue-error" role="alert">
          {error}
        </p>
      )}
      {!sets ? (
        <p>Loading…</p>
      ) : sets.length === 0 ? (
        <p className="card">No homework yet. Start with an import.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Title</th>
                <th>Status</th>
                <th>Entries</th>
                <th>Pictures</th>
                <th>Flagged</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((s) => (
                <tr key={s.id}>
                  <td>{s.kind === 'topic' ? <em>category</em> : (s.weekStart ?? <em>not set</em>)}</td>
                  <td>
                    <Link to={`/sets/${s.id}`}>{s.title}</Link> {s.sample && <span className="badge badge-sample">sample</span>}
                  </td>
                  <td>
                    <span className={`badge badge-${s.status}`}>{s.status}</span>
                  </td>
                  <td>{s.entryCount}</td>
                  <td>{s.imageCount}</td>
                  <td>{s.reviewCount > 0 ? <span className="badge badge-review">{s.reviewCount}</span> : '—'}</td>
                  <td className="actions">
                    <Link className="btn btn-small" to={`/sets/${s.id}`}>
                      Edit
                    </Link>
                    {s.status === 'published' ? (
                      <button className="btn btn-small" onClick={() => window.confirm(`Unpublish “${s.title}”? Learners will no longer see it.`) && act(() => adminApi.unpublish(s.id))}>
                        Unpublish
                      </button>
                    ) : (
                      <button className="btn btn-small" onClick={() => act(() => adminApi.publish(s.id))}>
                        Publish
                      </button>
                    )}
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => window.confirm(`Delete “${s.title}” and its pictures permanently? This cannot be undone.`) && act(() => adminApi.deleteSet(s.id))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
