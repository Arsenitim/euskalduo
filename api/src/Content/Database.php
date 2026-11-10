<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Thin wrapper around a SQLite file holding homework content, short-lived
 * throttling counters and anonymous daily usage totals. No learner data is
 * ever stored here.
 */
final class Database
{
    public const SCHEMA_VERSION = 8;

    private ?\PDO $pdo = null;

    public function __construct(private readonly string $dataDir)
    {
    }

    public function pdo(): \PDO
    {
        if (null === $this->pdo) {
            if (!is_dir($this->dataDir) && !mkdir($this->dataDir, 0775, true) && !is_dir($this->dataDir)) {
                throw new \RuntimeException('Cannot create data directory.');
            }
            $this->pdo = new \PDO('sqlite:'.$this->dataDir.'/euskalduo.sqlite', null, null, [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            ]);
            $this->pdo->exec('PRAGMA foreign_keys = ON');
            $this->pdo->exec('PRAGMA busy_timeout = 5000');
            $this->migrate();
        }

        return $this->pdo;
    }

    public function getMeta(string $key): ?string
    {
        $stmt = $this->pdo()->prepare('SELECT value FROM meta WHERE key = ?');
        $stmt->execute([$key]);
        $value = $stmt->fetchColumn();

        return false === $value ? null : (string) $value;
    }

    public function setMeta(string $key, string $value): void
    {
        $this->pdo()->prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            ->execute([$key, $value]);
    }

    private function migrate(): void
    {
        $pdo = $this->pdo;
        $pdo->exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        $version = (int) ($pdo->query("SELECT value FROM meta WHERE key = 'schema_version'")->fetchColumn() ?: 0);
        if ($version >= self::SCHEMA_VERSION) {
            return;
        }

        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->beginTransaction();
        $pdo->exec(<<<'SQL'
            CREATE TABLE IF NOT EXISTS homework_sets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                week_start TEXT,
                description TEXT,
                groups_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
                is_sample INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                published_at TEXT
            )
            SQL);
        $pdo->exec(<<<'SQL'
            CREATE TABLE IF NOT EXISTS entries (
                set_id TEXT NOT NULL REFERENCES homework_sets(id) ON DELETE CASCADE,
                id TEXT NOT NULL,
                position INTEGER NOT NULL,
                basque TEXT NOT NULL,
                translations_json TEXT NOT NULL,
                note TEXT,
                group_key TEXT,
                emoji TEXT,
                image_hint TEXT,
                image_file TEXT,
                needs_review INTEGER NOT NULL DEFAULT 0,
                review_note TEXT,
                PRIMARY KEY (set_id, id)
            )
            SQL);
        $pdo->exec('CREATE TABLE IF NOT EXISTS login_throttle (id INTEGER PRIMARY KEY CHECK (id = 1), failures INTEGER NOT NULL, window_start INTEGER NOT NULL)');
        // v2: rows older than FeedbackThrottle::WINDOW are pruned on every submission.
        $pdo->exec('CREATE TABLE IF NOT EXISTS feedback_throttle (ip TEXT NOT NULL, at INTEGER NOT NULL)');
        $pdo->exec('CREATE INDEX IF NOT EXISTS feedback_throttle_ip ON feedback_throttle(ip, at)');
        // v3: a set is either a homework week or a topic (category) without a week.
        $columns = array_column($pdo->query('PRAGMA table_info(homework_sets)')->fetchAll(), 'name');
        if (!\in_array('kind', $columns, true)) {
            $pdo->exec("ALTER TABLE homework_sets ADD COLUMN kind TEXT NOT NULL DEFAULT 'week' CHECK (kind IN ('week', 'topic'))");
        }
        $entryColumns = array_column($pdo->query('PRAGMA table_info(entries)')->fetchAll(), 'name');
        if (!\in_array('formation_json', $entryColumns, true)) {
            $pdo->exec('ALTER TABLE entries ADD COLUMN formation_json TEXT');
        }
        // v6: a set may announce an exam date; learners get an exam-preparation section until that day.
        if (!\in_array('exam_date', $columns, true)) {
            $pdo->exec('ALTER TABLE homework_sets ADD COLUMN exam_date TEXT');
        }
        // v4: anonymous usage counters, one row per day (see App\Stats\UsageStats).
        $pdo->exec('CREATE TABLE IF NOT EXISTS usage_daily (day TEXT PRIMARY KEY, new_devices INTEGER NOT NULL DEFAULT 0, active_devices INTEGER NOT NULL DEFAULT 0, answers INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, hinted INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0, rounds INTEGER NOT NULL DEFAULT 0)');
        // v7: devices counted once a week, and the same counters broken down by
        // homework set, exercise type, practice mode, connection and app/browser.
        $usageColumns = array_column($pdo->query('PRAGMA table_info(usage_daily)')->fetchAll(), 'name');
        if (!\in_array('weekly_devices', $usageColumns, true)) {
            $pdo->exec('ALTER TABLE usage_daily ADD COLUMN weekly_devices INTEGER NOT NULL DEFAULT 0');
        }
        $pdo->exec('CREATE TABLE IF NOT EXISTS usage_breakdown (day TEXT NOT NULL, dimension TEXT NOT NULL, key TEXT NOT NULL, answers INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, hinted INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0, rounds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, dimension, key))');
        // v8: one catalogue instead of weeks. Entries may be curated sentences
        // or grammar gaps; listening stories and exams (a selection of sets
        // with an optional date) get their own tables. The kind value "week"
        // stays in the database and means "school sheet"; week_start is kept
        // as an optional "received on" date that never drives learning.
        $entryColumns = array_column($pdo->query('PRAGMA table_info(entries)')->fetchAll(), 'name');
        if (!\in_array('entry_type', $entryColumns, true)) {
            $pdo->exec("ALTER TABLE entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'word' CHECK (entry_type IN ('word', 'sentence', 'grammar'))");
        }
        if (!\in_array('exercise_json', $entryColumns, true)) {
            $pdo->exec('ALTER TABLE entries ADD COLUMN exercise_json TEXT');
        }
        $pdo->exec(<<<'SQL'
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                format TEXT NOT NULL CHECK (format IN ('short', 'extended')),
                difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
                transcript TEXT NOT NULL,
                translations_json TEXT NOT NULL,
                questions_json TEXT NOT NULL,
                links_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
                needs_review INTEGER NOT NULL DEFAULT 0,
                review_note TEXT,
                is_sample INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                published_at TEXT
            )
            SQL);
        $hadExams = (bool) $pdo->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'exams'")->fetchColumn();
        $pdo->exec(<<<'SQL'
            CREATE TABLE IF NOT EXISTS exams (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                exam_date TEXT,
                set_ids_json TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            SQL);
        if (!$hadExams) {
            // An exam announced on a set becomes an exam of that one set, with the
            // set's id, so learners' old #/examen/<setId> links keep working.
            $now = gmdate('Y-m-d\TH:i:s\Z');
            $insert = $pdo->prepare("INSERT OR IGNORE INTO exams (id, title, exam_date, set_ids_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'published', ?, ?)");
            foreach ($pdo->query('SELECT id, title, exam_date FROM homework_sets WHERE exam_date IS NOT NULL')->fetchAll() as $row) {
                $insert->execute([$row['id'], $row['title'], $row['exam_date'], json_encode([$row['id']]), $now, $now]);
            }
        }
        $pdo->exec("INSERT INTO meta(key, value) VALUES('schema_version', '".self::SCHEMA_VERSION."') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        $pdo->commit();
    }
}
