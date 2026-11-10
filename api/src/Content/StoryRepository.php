<?php

declare(strict_types=1);

namespace App\Content;

/** Listening stories (Basque transcript, translations, questions, links). */
final class StoryRepository
{
    public function __construct(private readonly Database $db, private readonly ?AudioStore $audio = null)
    {
    }

    /** @return list<array<string, mixed>> */
    public function all(): array
    {
        $rows = $this->db->pdo()->query("SELECT * FROM stories ORDER BY format = 'extended', difficulty, title COLLATE NOCASE")->fetchAll();

        return array_map($this->story(...), $rows);
    }

    /** @return array<string, mixed>|null */
    public function find(string $id): ?array
    {
        $stmt = $this->db->pdo()->prepare('SELECT * FROM stories WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        return false === $row ? null : $this->story($row);
    }

    /**
     * Published stories for the public catalogue. Only stories whose audio
     * matches the current transcript are listed: an edited transcript has a
     * new audio key, so a stale clip can never be served for it.
     *
     * @return list<array<string, mixed>>
     */
    public function publishedContent(): array
    {
        $result = [];
        foreach ($this->db->pdo()->query("SELECT * FROM stories WHERE status = 'published' ORDER BY format = 'extended', difficulty, title COLLATE NOCASE")->fetchAll() as $row) {
            $story = $this->story($row);
            $audio = $this->audio?->url($story['transcript']);
            if (null === $audio) {
                continue;
            }
            $result[] = [
                'id' => $story['id'],
                'title' => $story['title'],
                'format' => $story['format'],
                'difficulty' => $story['difficulty'],
                'transcript' => $story['transcript'],
                'translations' => $story['translations'],
                'questions' => $story['questions'],
                'links' => $story['links'],
                'audio' => $audio,
                'durationMs' => $this->audio?->durationMs($story['transcript']),
            ];
        }

        return $result;
    }

    /** @param array<string, mixed> $draft validated draft */
    public function create(array $draft, bool $isSample = false): string
    {
        $id = $draft['id'] ?? null;
        if (null === $id || null !== $this->find($id)) {
            do {
                $id = 'st'.bin2hex(random_bytes(5));
            } while (null !== $this->find($id));
        }
        $now = self::now();
        $this->db->pdo()->prepare('INSERT INTO stories (id, title, format, difficulty, transcript, translations_json, questions_json, links_json, status, needs_review, review_note, is_sample, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $draft['title'], $draft['format'], $draft['difficulty'], $draft['transcript'], self::json($draft['translations']), self::json($draft['questions']), self::json($draft['links']), 'draft', (int) $draft['needsReview'], $draft['reviewNote'], (int) $isSample, $now, $now]);

        return $id;
    }

    /** @param array<string, mixed> $draft validated draft (its id is ignored: ids are stable) */
    public function update(string $id, array $draft): void
    {
        $this->db->pdo()->prepare('UPDATE stories SET title = ?, format = ?, difficulty = ?, transcript = ?, translations_json = ?, questions_json = ?, links_json = ?, needs_review = ?, review_note = ?, updated_at = ? WHERE id = ?')
            ->execute([$draft['title'], $draft['format'], $draft['difficulty'], $draft['transcript'], self::json($draft['translations']), self::json($draft['questions']), self::json($draft['links']), (int) $draft['needsReview'], $draft['reviewNote'], self::now(), $id]);
    }

    public function delete(string $id): void
    {
        $this->db->pdo()->prepare('DELETE FROM stories WHERE id = ?')->execute([$id]);
    }

    public function setStatus(string $id, string $status): void
    {
        $this->db->pdo()->prepare('UPDATE stories SET status = ?, published_at = CASE WHEN ? = \'published\' THEN ? ELSE published_at END, updated_at = ? WHERE id = ?')
            ->execute([$status, $status, self::now(), self::now(), $id]);
    }

    /** @return list<string> */
    public function transcripts(): array
    {
        return array_map('strval', $this->db->pdo()->query('SELECT DISTINCT transcript FROM stories ORDER BY transcript')->fetchAll(\PDO::FETCH_COLUMN));
    }

    /** @return list<string> */
    public function ids(): array
    {
        return array_map('strval', $this->db->pdo()->query('SELECT id FROM stories')->fetchAll(\PDO::FETCH_COLUMN));
    }

    /**
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private function story(array $row): array
    {
        $links = json_decode($row['links_json'], true, 8, \JSON_THROW_ON_ERROR);

        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'format' => $row['format'],
            'difficulty' => (int) $row['difficulty'],
            'transcript' => $row['transcript'],
            'translations' => json_decode($row['translations_json'], true, 8, \JSON_THROW_ON_ERROR),
            'questions' => json_decode($row['questions_json'], true, 8, \JSON_THROW_ON_ERROR),
            'links' => ['sets' => $links['sets'] ?? [], 'entries' => $links['entries'] ?? [], 'words' => $links['words'] ?? [], 'topics' => $links['topics'] ?? []],
            'status' => $row['status'],
            'needsReview' => (bool) $row['needs_review'],
            'reviewNote' => $row['review_note'],
            'sample' => (bool) $row['is_sample'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'publishedAt' => $row['published_at'],
        ];
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s\Z');
    }

    private static function json(mixed $value): string
    {
        return json_encode($value, \JSON_THROW_ON_ERROR | \JSON_UNESCAPED_UNICODE);
    }
}
