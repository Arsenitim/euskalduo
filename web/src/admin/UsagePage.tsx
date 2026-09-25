import { useEffect, useState } from 'react';
import { adminApi, type UsageReport } from './api';

const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)} %` : '—');

/** Anonymous daily totals reported by learners' browsers (no ids, no IPs). */
export function UsagePage() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .stats()
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <p className="issue issue-error" role="alert">
        {error}
      </p>
    );
  }
  if (!report) return <p>Loading…</p>;

  const { totals, days } = report;
  const maxAnswers = Math.max(1, ...days.map((d) => d.answers));

  return (
    <div>
      <h1>Usage</h1>
      <p className="muted">
        Anonymous counters sent by browsers while practising. There are no device ids or IPs, so a device counts again after its browser data is cleared, and
        each browser profile counts separately. Days are UTC.
      </p>
      <div className="stat-tiles">
        <Tile label="Devices (all time)" value={totals.new_devices} />
        <Tile label="Active today" value={days[0]?.active_devices ?? 0} />
        <Tile label="Answers (all time)" value={totals.answers} />
        <Tile label="Rounds finished" value={totals.rounds} />
      </div>
      <p className="muted">
        Answers: {pct(totals.correct, totals.answers)} right on their own · {pct(totals.hinted, totals.answers)} with a hint · {pct(totals.wrong, totals.answers)} wrong
        · {pct(totals.skipped, totals.answers)} skipped (“No lo sé”).
      </p>
      <h2>Last 30 days</h2>
      <div className="table-wrap">
        <table className="admin-table usage-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Active devices</th>
              <th>New devices</th>
              <th>Answers</th>
              <th>Right</th>
              <th>Hint</th>
              <th>Wrong</th>
              <th>Skipped</th>
              <th>Rounds</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className={d.answers === 0 && d.active_devices === 0 ? 'is-quiet' : undefined}>
                <td>{d.day}</td>
                <td>{d.active_devices}</td>
                <td>{d.new_devices}</td>
                <td>
                  <span className="usage-bar" style={{ width: `${(d.answers / maxAnswers) * 100}%` }} aria-hidden="true" />
                  <span className="usage-num">{d.answers}</span>
                </td>
                <td>{d.correct}</td>
                <td>{d.hinted}</td>
                <td>{d.wrong}</td>
                <td>{d.skipped}</td>
                <td>{d.rounds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card stat-tile">
      <span className="stat-value">{value.toLocaleString('es-ES')}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
