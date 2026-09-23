<?php

declare(strict_types=1);

namespace App\Content;

/**
 * Thin wrapper around a SQLite file holding homework content only.
 * No learner data is ever stored here.
 */
final class Database
{
    private const SCHEMA_VERSION = 1;

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
        $pdo->exec("INSERT INTO meta(key, value) VALUES('schema_version', '".self::SCHEMA_VERSION."') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        $pdo->commit();
    }
}
