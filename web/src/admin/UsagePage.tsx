import { useEffect, useState } from 'react';
import { setStatsExcluded, statsExcluded } from '../api/stats';
import { adminApi, type UsageBreakdownRow, type UsageDimension, type UsageReport } from './api';

const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)} %` : '—');

const DIMENSIONS: Array<{ id: UsageDimension; title: string; column: string; labels?: Record<string, string> }> = [
  { id: 'set', title: 'By homework set', column: 'Set' },
  {
    id: 'exercise',
    title: 'By exercise type',
    column: 'Exercise',
    labels: {
      'meaning-choice': 'Pick the meaning',
      'basque-choice': 'Pick the Basque word',
      spell: 'Spell the word',
      'type-meaning': 'Type the meaning',
      'word-build': 'Build the word',
      order: 'Put in order',
    },
  },
  { id: 'mode', title: 'By practice mode', column: 'Mode', labels: { week: 'Homework week', topic: 'Categoría', exam: 'Exam preparation', mix: 'Mix' } },
  { id: 'connection', title: 'Online or offline', column: 'Connection', labels: { online: 'Online', offline: 'Offline' } },
  { id: 'display', title: 'Installed app or browser', column: 'Opened as', labels: { app: 'Installed app (home screen)', browser: 'Browser tab' } },
];

/** Anonymous totals reported by learners' browsers (no ids, no IPs). */
export function UsagePage() {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState(statsExcluded);

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

  const { totals, days, weeks, breakdown } = report;
  const maxAnswers = Math.max(1, ...days.map((d) => d.answers));

  return (
    <div>
      <h1>Usage</h1>
      <p className="muted">
        Anonymous counters sent by browsers while practising. There are no device ids or IPs, so a device counts again after its browser data is cleared, and
        each browser profile counts separately. Days are UTC.
      </p>
      <div className="stat-tiles">
        <Tile label="Devices this week" value={weeks[0]?.weekly_devices ?? 0} />
        <Tile label="Active today" value={days[0]?.active_devices ?? 0} />
        <Tile label="Answers (all time)" value={totals.answers} />
        <Tile label="Rounds finished" value={totals.rounds} />
      </div>
      <p className="muted">
        Answers: {pct(totals.correct, totals.answers)} right on their own · {pct(totals.hinted, totals.answers)} with a hint · {pct(totals.wrong, totals.answers)} wrong
        · {pct(totals.skipped, totals.answers)} skipped (“No lo sé”). {totals.new_devices.toLocaleString('es-ES')} browsers have practised since counting began.
      </p>

      <section className="card usage-exclude">
        <label>
          <input
            type="checkbox"
            checked={!excluded}
            onChange={(e) => {
              setStatsExcluded(!e.target.checked);
              setExcluded(statsExcluded());
            }}
          />{' '}
          Count practice from this browser
        </label>
        <p className="muted small">
          Signing in to the admin area turns this off, so our own testing does not look like learners. If a child practises in this browser (e.g. a family
          tablet), turn it back on.
        </p>
      </section>

      <h2>Last 8 weeks</h2>
      <p className="muted small">Devices = browsers that practised at least once that week (Monday to Sunday). Counted from November 2026; earlier weeks show —.</p>
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Week of</th>
              <th>Devices</th>
              <th>New devices</th>
              <th>Answers</th>
              <th>Rounds</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week} className={w.answers === 0 ? 'is-quiet' : undefined}>
                <td>{w.week}</td>
                <td>{w.weekly_devices === 0 && w.answers > 0 ? '—' : w.weekly_devices}</td>
                <td>{w.new_devices}</td>
                <td>{w.answers}</td>
                <td>{w.rounds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Last 30 days, broken down</h2>
      <p className="muted small">Counted from November 2026. A round of “Mix” counts under the mode only, not under each set it mixes.</p>
      {DIMENSIONS.map((d) => (
        <Breakdown key={d.id} title={d.title} column={d.column} rows={breakdown[d.id] ?? []} label={(row) => (d.id === 'set' ? (row.title ?? `${row.key} (deleted)`) : (d.labels?.[row.key] ?? row.key))} />
      ))}

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

function Breakdown({ title, column, rows, label }: { title: string; column: string; rows: UsageBreakdownRow[]; label: (row: UsageBreakdownRow) => string }) {
  return (
    <>
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted small">Nothing yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{column}</th>
                <th>Answers</th>
                <th>Right</th>
                <th>Hint</th>
                <th>Wrong</th>
                <th>Skipped</th>
                <th>Rounds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{label(r)}</td>
                  <td>{r.answers}</td>
                  <td>{pct(r.correct, r.answers)}</td>
                  <td>{pct(r.hinted, r.answers)}</td>
                  <td>{pct(r.wrong, r.answers)}</td>
                  <td>{pct(r.skipped, r.answers)}</td>
                  <td>{r.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
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
